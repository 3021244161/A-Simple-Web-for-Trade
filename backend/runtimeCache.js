// Bounded, single-flight cache. Clearing a pending entry never lets it repopulate.
const createAsyncCache = ({ ttlMs, maxEntries = 256, now = Date.now }) => {
  const entries = new Map();
  const get = (key, load) => {
    const existing = entries.get(key);
    if (existing && (existing.promise || existing.expiresAt > now())) {
      entries.delete(key);
      entries.set(key, existing);
      return existing.promise || Promise.resolve(existing.value);
    }
    entries.delete(key);
    const entry = {};
    entry.promise = Promise.resolve().then(load).then(value => {
      if (entries.get(key) === entry) {
        entry.value = value;
        entry.expiresAt = now() + ttlMs;
        entry.promise = null;
      }
      return value;
    }, error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
    entries.set(key, entry);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return entry.promise;
  };
  return {
    get,
    set: (key, value) => {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    delete: key => entries.delete(key),
    clear: () => entries.clear(),
    get size() { return entries.size; }
  };
};

module.exports = { createAsyncCache };
