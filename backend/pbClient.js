const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const PB_URL = process.env.PB_URL || 'http://0.0.0.0:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@example.com';
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'ChangeThisPassword123!';

const pbHttp = axios.create({
  baseURL: PB_URL,
  timeout: 30000
});

const escapeFilter = (value = '') => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const adminAuth = async () => {
  const { data } = await pbHttp.post('/api/admins/auth-with-password', {
    identity: PB_ADMIN_EMAIL,
    password: PB_ADMIN_PASSWORD
  });
  return data.token;
};

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
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  buildProductImageUrl,
  buildPbFileUrl,
  createFileForm
};
