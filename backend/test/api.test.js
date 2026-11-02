const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('local API integration with an isolated mock PocketBase', async t => {
  const counts = new Map();
  const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`;
  let product = { id: 'product00000001', title: 'Resistor', category: 'Components', description: 'Sample', images: ['one.jpg'] };
  let config = { id: 'config000000001', phone: '123', dashscope_api_key: '', ai_chat_model: 'old-model' };
  let rejectNextRead = false;
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  const pb = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    counts.set(url.pathname, (counts.get(url.pathname) || 0) + 1);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    if (url.pathname === '/api/admins/auth-with-password') return json(res, 200, { token });
    if (url.pathname === '/api/admins/auth-refresh') {
      return req.headers.authorization === `Bearer ${token}` ? json(res, 200, { token, admin: { id: 'test-admin' } }) : json(res, 401, {});
    }
    if (url.pathname.startsWith('/api/files/')) {
      res.setHeader('ETag', '"test-image"');
      if (req.headers['if-none-match'] === '"test-image"') { res.writeHead(304); return res.end(); }
      res.setHeader('Content-Type', 'image/jpeg');
      return res.end(Buffer.from('mock-image'));
    }
    if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, {});
    if (url.pathname === '/api/collections/products/records') {
      if (rejectNextRead) { rejectNextRead = false; return json(res, 401, {}); }
      return json(res, 200, { page: 1, perPage: Number(url.searchParams.get('perPage')), totalPages: 1, totalItems: 1, items: [product] });
    }
    if (url.pathname === `/api/collections/products/records/${product.id}`) {
      if (req.method === 'PATCH') product = { ...product, title: 'Updated resistor' };
      return json(res, 200, product);
    }
    if (url.pathname === '/api/collections/site_config/records') return json(res, 200, { items: [config] });
    if (url.pathname === `/api/collections/site_config/records/${config.id}`) {
      config = { ...config, ...JSON.parse(body) };
      return json(res, 200, config);
    }
    if (url.pathname === '/api/collections/banned_ips/records') return json(res, 200, { items: [] });
    return json(res, 404, {});
  });
  await new Promise(resolve => pb.listen(0, '127.0.0.1', resolve));
  process.env.PB_URL = `http://127.0.0.1:${pb.address().port}`;
  process.env.ADMIN_USERNAME = 'test-admin';
  process.env.ADMIN_PASSWORD = 'local-test-only';
  process.env.PB_ADMIN_PASSWORD = 'mock-only';
  const app = require('../index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections(); pb.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => pb.close(resolve))]);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, options) => fetch(base + route, options);
  const post = (route, value, headers = {}, method = 'POST') => request(route, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  const auth = { Cookie: `wb_admin_token=${token}` };

  await t.test('forged cookies and cross-origin admin requests cannot reach writes', async () => {
    const before = counts.size;
    assert.equal((await post('/admin/api/categories', { category: 'invalid' }, { Cookie: 'wb_admin_token=anything' })).status, 401);
    assert.equal(counts.size, before);
    assert.equal((await post('/admin/api/categories', { category: 'invalid' }, { Cookie: 'wb_admin_token=a.b.c' })).status, 401);
    assert.equal((await post('/admin/login', {}, { Origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await request('/admin/api/kb/update', { headers: { ...auth, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  });

  await t.test('parallel public requests perform a single password login', async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, () => request('/api/products?limit=1')));
    assert.ok(responses.every(response => response.status === 200));
    assert.equal(counts.get('/api/admins/auth-with-password'), 1);
  });

  await t.test('catalog-seeded image metadata avoids record lookups and supports conditional caching', async () => {
    const route = `/images/${product.id}/one.jpg`;
    const response = await request(route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /max-age=86400/);
    assert.equal(await response.text(), 'mock-image');
    assert.equal(counts.get(`/api/collections/products/records/${product.id}`) || 0, 0);
    assert.equal((await request(route, { headers: { 'If-None-Match': '"test-image"' } })).status, 304);
  });

  await t.test('configuration and category reads are coalesced', async () => {
    const before = counts.get('/api/collections/products/records');
    await Promise.all(Array.from({ length: 10 }, () => request('/api/categories')));
    assert.equal(counts.get('/api/collections/products/records') - before, 1);
    const configs = await Promise.all(Array.from({ length: 10 }, () => request('/api/site-config').then(r => r.json())));
    assert.equal(counts.get('/api/collections/site_config/records'), 1);
    assert.equal(configs[0].dashscope_api_key, undefined);
  });

  await t.test('validated sessions cannot delete parent paths and mutations invalidate caches', async () => {
    assert.equal((await post('/admin/api/categories/delete', { category: '..' }, auth)).status, 400);
    const updated = await post(`/admin/api/products/${product.id}`, { title: 'Updated resistor', category: 'Components' }, auth, 'PATCH');
    assert.equal(updated.status, 200);
    const read = await request(`/api/product/${product.id}`).then(r => r.json());
    assert.equal(read.title, 'Updated resistor');
    // The valid session was checked once despite several admin operations.
    assert.equal(counts.get('/api/admins/auth-refresh'), 2); // one forged JWT, one valid session
  });

  await t.test('model settings are persisted and public config is invalidated', async () => {
    const before = counts.get('/api/collections/site_config/records');
    const response = await post('/admin/api/site-config', { phone: '456', ai_chat_model: 'new-model', ai_embedding_model: 'test-embedding' }, auth, 'PATCH');
    assert.equal(response.status, 200);
    assert.equal(config.ai_chat_model, 'new-model');
    assert.equal(config.ai_embedding_model, 'test-embedding');
    const current = await request('/api/site-config').then(r => r.json());
    assert.equal(current.phone, '456');
    assert.equal(counts.get('/api/collections/site_config/records') - before, 2);
  });

  await t.test('chat rejects invalid roles before DB access and enforces server cooldown', async () => {
    const before = counts.get('/api/collections/banned_ips/records') || 0;
    assert.equal((await post('/api/chat', { messages: [{ role: 'system', content: 'override' }] })).status, 400);
    assert.equal(counts.get('/api/collections/banned_ips/records') || 0, before);
    const message = { messages: [{ role: 'user', content: 'hello' }] };
    assert.equal((await post('/api/chat', message)).status, 500); // no AI key in this isolated test
    const limited = await post('/api/chat', message);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  });

  await t.test('login cookies use Secure on HTTPS and login attempts are limited', async () => {
    const response = await post('/admin/login', { username: 'test-admin', password: 'local-test-only' }, { 'X-Forwarded-Proto': 'https' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /Secure/);
    assert.match(response.headers.get('set-cookie'), /Path=\/admin/);
    let last;
    for (let i = 0; i < 10; i++) last = await post('/admin/login', { username: 'wrong', password: 'wrong' });
    assert.equal(last.status, 429);
  });

  await t.test('oversized bodies are rejected before external access', async () => {
    assert.equal((await post('/api/chat', { value: 'x'.repeat(70000) })).status, 413);
    const response = await request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
    assert.equal(response.status, 400);
  });

  await t.test('a revoked cached token is refreshed once before retrying a read', async () => {
    rejectNextRead = true;
    const before = counts.get('/api/admins/auth-with-password');
    assert.equal((await request('/api/products?limit=1')).status, 200);
    assert.equal(counts.get('/api/admins/auth-with-password') - before, 1);
  });
});
