const path = require('node:path');

const categoryDirectory = (root, input) => {
  const invalid = () => Object.assign(new Error('Invalid category name'), { status: 400 });
  if (typeof input !== 'string') throw invalid();
  const name = input.trim();
  if (!name || name.length > 160 || name === '.' || name === '..' || /[\/\\\x00-\x1f]/.test(name)) {
    throw invalid();
  }
  const directory = path.resolve(root, name);
  const relative = path.relative(path.resolve(root), directory);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw invalid();
  }
  return { name, directory };
};

const validateArchive = entries => {
  if (entries.length > 2000) throw new Error('Archive exceeds 2000 entries');
  let total = 0;
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    const size = entry.header.size;
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..') || name.includes('\0')) {
      throw new Error('Archive contains an unsafe path');
    }
    if (!Number.isSafeInteger(size) || size < 0 || size > 50 * 1024 * 1024) throw new Error('Archive entry is too large');
    total += size;
    if (total > 100 * 1024 * 1024) throw new Error('Uncompressed archive exceeds 100 MB');
  }
};

const validateChatMessages = messages => {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 24) return false;
  let total = 0;
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return false;
    if (!message.content.trim() || message.content.length > 4000) return false;
    total += message.content.length;
  }
  return total <= 16000 && messages[messages.length - 1].role === 'user';
};

const positiveInteger = (value, fallback, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(1, Math.floor(number))) : fallback;
};

const sameOriginAdmin = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'same-origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/api/')) {
    const origin = req.get('origin');
    let valid = req.get('sec-fetch-site') !== 'cross-site';
    if (origin) {
      try { valid = valid && new URL(origin).origin === new URL(`${req.protocol}://${req.get('host')}`).origin; }
      catch { valid = false; }
    }
    if (!valid) return res.status(403).json({ error: 'Cross-origin admin request denied' });
  }
  next();
};

module.exports = { categoryDirectory, validateArchive, validateChatMessages, positiveInteger, sameOriginAdmin };
