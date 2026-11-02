const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const createKnowledgeBase = (filePath, { checkIntervalMs = 5000, now = Date.now, onError = console.error } = {}) => {
  let vectors = [];
  let signature;
  let nextCheck = 0;
  let pending;
  let generation = 0;

  const get = () => {
    if (pending) return pending;
    if (now() < nextCheck) return Promise.resolve(vectors);
    const version = generation;
    pending = (async () => {
      try {
        const stat = await fs.stat(filePath);
        const current = `${stat.mtimeMs}:${stat.size}`;
        if (current !== signature) {
          const records = JSON.parse(await fs.readFile(filePath, 'utf8'));
          if (!Array.isArray(records)) throw new Error('Knowledge base must contain an array');
          const loaded = [];
          for (const record of records) {
            if (typeof record.id !== 'string' || !Array.isArray(record.embedding) || !record.embedding.length) continue;
            if (!record.embedding.every(value => typeof value === 'number' && Number.isFinite(value))) continue;
            const embedding = Float32Array.from(record.embedding);
            const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
            if (norm > 0 && Number.isFinite(norm)) loaded.push({ id: record.id, embedding, norm });
          }
          if (version === generation) { vectors = loaded; signature = current; }
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          if (version === generation) { vectors = []; signature = undefined; }
        } else {
          // Keep the last complete version if an external write is incomplete.
          onError('Knowledge base reload failed:', error.message);
        }
      } finally {
        if (version === generation) nextCheck = now() + checkIntervalMs;
      }
      return vectors;
    })().finally(() => { pending = null; });
    return pending;
  };

  const invalidate = () => { generation += 1; signature = undefined; nextCheck = 0; };
  const write = async records => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(records), { flag: 'wx' });
      await fs.rename(temporary, filePath);
      invalidate();
    } finally {
      await fs.rm(temporary, { force: true });
    }
  };
  return { get, write, invalidate };
};

const findNearest = (records, query, count = 5) => {
  if (!Array.isArray(query) || !query.length || !query.every(Number.isFinite)) return [];
  const norm = Math.sqrt(query.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return [];
  const best = [];
  for (const record of records) {
    if (record.embedding.length !== query.length) continue;
    let dot = 0;
    for (let i = 0; i < query.length; i++) dot += record.embedding[i] * query[i];
    const score = dot / (record.norm * norm);
    if (!Number.isFinite(score)) continue;
    const position = best.findIndex(item => score > item.score);
    best.splice(position < 0 ? best.length : position, 0, { id: record.id, score });
    if (best.length > count) best.pop();
  }
  return best.map(item => item.id);
};

module.exports = { createKnowledgeBase, findNearest };
