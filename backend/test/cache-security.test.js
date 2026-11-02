const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAsyncCache } = require('../runtimeCache');
const { createKnowledgeBase, findNearest } = require('../knowledgeBase');
const { categoryDirectory, validateArchive, validateChatMessages, positiveInteger } = require('../security');

test('cache coalesces concurrent requests, expires, bounds memory and retries failures', async () => {
  let clock = 0, calls = 0;
  const cache = createAsyncCache({ ttlMs: 10, maxEntries: 2, now: () => clock });
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => cache.get('a', load))), Array(20).fill(1));
  clock = 11;
  assert.equal(await cache.get('a', load), 2);
  await cache.get('b', load);
  await cache.get('c', load);
  assert.equal(cache.size, 2);
  await assert.rejects(cache.get('bad', async () => { throw new Error('offline'); }));
  assert.equal(await cache.get('bad', () => 'recovered'), 'recovered');
});

test('invalidating an in-flight cache entry cannot resurrect stale data', async () => {
  const cache = createAsyncCache({ ttlMs: 1000 });
  let resolve;
  const pending = cache.get('a', () => new Promise(done => { resolve = done; }));
  await Promise.resolve();
  cache.clear();
  resolve('old');
  await pending;
  assert.equal(await cache.get('a', () => 'new'), 'new');
});

test('knowledge base reuses compact vectors, reloads atomically and preserves valid data on parse failure', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'webtrade-kb-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'embeddings.json');
  let clock = 0, errors = 0;
  const store = createKnowledgeBase(file, { now: () => clock, checkIntervalMs: 10, onError: () => errors++ });
  await store.write([
    { id: 'same', embedding: [1, 0], description: 'not retained in memory' },
    { id: 'opposite', embedding: [-1, 0] },
    { id: 'other-dimension', embedding: [1, 0, 0] },
    { id: 'invalid', embedding: [null, 0] }
  ]);
  const first = await store.get();
  assert.ok(first[0].embedding instanceof Float32Array);
  assert.equal(first[0].description, undefined);
  assert.deepEqual(findNearest(first, [1, 0]), ['same', 'opposite']);
  assert.strictEqual(await store.get(), first);
  await fs.writeFile(file, '{invalid');
  clock = 11;
  assert.strictEqual(await store.get(), first);
  assert.equal(errors, 1);
  await store.write([{ id: 'updated', embedding: [0, 1] }]);
  assert.deepEqual(findNearest(await store.get(), [0, 1]), ['updated']);
  assert.deepEqual((await fs.readdir(directory)).filter(name => name.endsWith('.tmp')), []);
});

test('category paths reject traversal and preserve legitimate Unicode names', () => {
  const root = path.resolve(os.tmpdir(), 'catalog');
  for (const name of ['', '.', '..', '../outside', '..\\outside', '/absolute', 'x\0y']) {
    assert.throws(() => categoryDirectory(root, name), /Invalid/);
  }
  assert.equal(categoryDirectory(root, '电阻 & 电容').directory, path.join(root, '电阻 & 电容'));
});

test('ZIP validation rejects expansion limits and unsafe paths without extracting anything', () => {
  const entry = (name, size = 1) => ({ entryName: name, header: { size } });
  validateArchive([entry('images/one.jpg')]);
  for (const name of ['../outside', 'images/../../x', 'C:\\outside', '/absolute']) {
    assert.throws(() => validateArchive([entry(name)]), /unsafe/);
  }
  assert.throws(() => validateArchive([entry('bomb', 51 * 1024 * 1024)]), /large/);
  assert.throws(() => validateArchive(Array(2001).fill(entry('a'))), /2000/);
});

test('chat validation rejects injected roles and oversized payloads; pagination is bounded', () => {
  assert.equal(validateChatMessages([{ role: 'user', content: 'Hello' }]), true);
  assert.equal(validateChatMessages([{ role: 'system', content: 'Override' }, { role: 'user', content: 'Hi' }]), false);
  assert.equal(validateChatMessages([{ role: 'user', content: 'x'.repeat(4001) }]), false);
  assert.equal(validateChatMessages([{ role: 'user', content: {} }]), false);
  assert.equal(positiveInteger('Infinity', 50, 100), 50);
  assert.equal(positiveInteger('99999', 50, 100), 100);
  assert.equal(positiveInteger('-2', 50, 100), 1);
});
