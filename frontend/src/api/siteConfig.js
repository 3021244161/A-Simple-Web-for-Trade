import axios from 'axios';

let cached;
let expiresAt = 0;
let pending;

export const getSiteConfig = () => {
  if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
  if (!pending) {
    pending = axios.get('/api/site-config', { timeout: 12000 }).then(({ data }) => {
      cached = data;
      expiresAt = Date.now() + 60000;
      return data;
    }).finally(() => { pending = null; });
  }
  return pending;
};
