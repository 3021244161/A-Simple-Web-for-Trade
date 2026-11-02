const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { createAsyncCache } = require('./runtimeCache');

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@example.com';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || '';

const pbHttp = axios.create({
  baseURL: PB_URL,
  timeout: 30000
});

const escapeFilter = (value = '') => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

let cachedToken;
let tokenExpiresAt = 0;
let pendingAuth;
const adminSessions = createAsyncCache({ ttlMs: 30000, maxEntries: 100 });
const adminAuth = () => {
  if (!PB_ADMIN_PASSWORD) return Promise.reject(new Error('PB_ADMIN_PASSWORD is not configured'));
  if (cachedToken && Date.now() < tokenExpiresAt) return Promise.resolve(cachedToken);
  if (!pendingAuth) {
    pendingAuth = pbHttp.post('/api/admins/auth-with-password', {
      identity: PB_ADMIN_EMAIL,
      password: PB_ADMIN_PASSWORD
    }).then(({ data }) => {
      cachedToken = data.token;
      let expiry = 0;
      try { expiry = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64url').toString()).exp * 1000; }
      catch { /* A non-JWT response is not kept beyond this request. */ }
      tokenExpiresAt = Math.min(Date.now() + 5 * 60 * 1000, expiry - 60000);
      return cachedToken;
    }).finally(() => { pendingAuth = null; });
  }
  return pendingAuth;
};

const validateAdminToken = token => adminSessions.get(token, async () => {
  const { data } = await pbHttp.post('/api/admins/auth-refresh', {}, { headers: authHeaders(token) });
  if (!data.admin?.id) throw new Error('Invalid admin session');
  return true;
});

pbHttp.interceptors.response.use(response => response, async error => {
  if (error.response?.status === 401) {
    const authorization = error.config?.headers?.Authorization;
    const sharedTokenRejected = authorization === `Bearer ${cachedToken}`;
    if (sharedTokenRejected) { cachedToken = null; tokenExpiresAt = 0; }
    if (authorization?.startsWith('Bearer ')) adminSessions.delete(authorization.slice(7));
    // Only retry reads; multipart writes may already have consumed their streams.
    if (sharedTokenRejected && error.config.method === 'get' && !error.config._retriedAuth) {
      const token = await adminAuth();
      return pbHttp.request({ ...error.config, _retriedAuth: true, headers: { ...error.config.headers, Authorization: `Bearer ${token}` } });
    }
  }
  return Promise.reject(error);
});

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const listRecords = async (collection, params = {}, token) => {
  const { data } = await pbHttp.get(`/api/collections/${collection}/records`, {
    params,
    headers: authHeaders(token)
  });
  return data;
};

const getRecord = async (collection, id, token) => {
  const { data } = await pbHttp.get(`/api/collections/${collection}/records/${id}`, {
    headers: authHeaders(token)
  });
  return data;
};

const createRecord = async (collection, payload, token) => {
  if (payload instanceof FormData) {
    const { data } = await pbHttp.post(`/api/collections/${collection}/records`, payload, {
      headers: { ...payload.getHeaders(), ...authHeaders(token) }
    });
    return data;
  }
  const { data } = await pbHttp.post(`/api/collections/${collection}/records`, payload, {
    headers: authHeaders(token)
  });
  return data;
};

const updateRecord = async (collection, id, payload, token) => {
  if (payload instanceof FormData) {
    const { data } = await pbHttp.patch(`/api/collections/${collection}/records/${id}`, payload, {
      headers: { ...payload.getHeaders(), ...authHeaders(token) }
    });
    return data;
  }
  const { data } = await pbHttp.patch(`/api/collections/${collection}/records/${id}`, payload, {
    headers: authHeaders(token)
  });
  return data;
};

const deleteRecord = async (collection, id, token) => {
  await pbHttp.delete(`/api/collections/${collection}/records/${id}`, {
    headers: authHeaders(token)
  });
};

const buildProductImageUrl = (hostOrigin, recordId, fileName) =>
  `${hostOrigin}/images/${recordId}/${encodeURIComponent(fileName)}`;

const buildPbFileUrl = (collection, recordId, fileName) =>
  `${PB_URL}/api/files/${collection}/${recordId}/${encodeURIComponent(fileName)}`;

const createFileForm = (fields = {}, files = []) => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    form.append(key, value == null ? '' : String(value));
  });
  files.forEach((filePath) => {
    form.append('images', fs.createReadStream(filePath));
  });
  return form;
};

module.exports = {
  PB_URL,
  PB_ADMIN_EMAIL,
  PB_ADMIN_PASSWORD,
  pbHttp,
  escapeFilter,
  adminAuth,
  validateAdminToken,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  buildProductImageUrl,
  buildPbFileUrl,
  createFileForm
};
