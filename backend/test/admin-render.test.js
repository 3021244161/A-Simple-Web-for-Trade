const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('admin lists escape stored HTML and never put data into executable attributes', async () => {
  const payload = '\"><img src=x onerror=alert(1)><script>alert(2)</script>\' &';
  const nodes = new Map();
  const node = () => ({ innerHTML: '', textContent: '', style: {}, children: [], addEventListener() {}, appendChild(child) { this.children.push(child); } });
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: node };
  const context = vm.createContext({ document, window: {}, URLSearchParams, console, fetch: async url => ({
    ok: true,
    json: async () => url.includes('/messages') ? [{ id: payload, name: payload, email: payload, message: payload }]
      : url.includes('/categories') ? [{ category: payload }]
      : { items: [{ id: payload, title: payload, category: payload, description: payload }], totalItems: 1, totalPages: 1 }
  }) });
  const html = fs.readFileSync(path.join(__dirname, '../admin-mobile.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  await vm.runInContext('Promise.all([loadMessages(), loadCategories(), loadProducts()])', context);
  for (const id of ['messages', 'products', 'categoryOptions', 'categoryList']) {
    const rendered = nodes.get(id).innerHTML;
    assert.ok(!rendered.includes('<img'), id);
    assert.ok(!rendered.includes('<script'), id);
    assert.ok(rendered.includes('&lt;'), id);
    for (const handler of rendered.matchAll(/onclick="([^"]*)"/g)) {
      assert.match(handler[1], /^[A-Za-z]+ByIndex\(\d+\)$/);
    }
  }
  vm.runInContext(`appendProgress(${JSON.stringify(payload)}, true)`, context);
  assert.equal(nodes.get('kbProgressText').children[0].textContent, payload + '\n');
});
