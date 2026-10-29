import { api } from './client.js';

// FE-13 System Administration (owner: Linh).
export async function createAccount(payload) {
  const { data } = await api.post('/admin/accounts', payload); // UC-92
  return data;
}

// UC-93 Import Accounts. type = STUDENT | TEACHER | PARENT | SCHOOL_MANAGER.
export async function downloadImportTemplate(type) {
  const res = await api.get('/admin/accounts/import/template', { params: { type }, responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'mau-nhap-tai-khoan.xlsx';
  saveBlob(res.data, name);
}

function importForm(type, file) {
  const form = new FormData();
  form.append('type', type);
  form.append('file', file);
  return form;
}

export async function previewImport(type, file) {
  const { data } = await api.post('/admin/accounts/import/preview', importForm(type, file));
  return data;
}

export async function importAccounts(type, file) {
  const { data } = await api.post('/admin/accounts/import', importForm(type, file));
  return data;
}

// Saves a file the browser holds (Blob, or { base64, contentType } from the server) under `name`.
export function saveBlob(blobOrBase64, name, contentType) {
  let blob = blobOrBase64;
  if (typeof blobOrBase64 === 'string') {
    const bytes = Uint8Array.from(atob(blobOrBase64), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: contentType });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- UC-94..98 accounts
const fileName = (res, fallback) => /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? fallback;

export async function listAccounts(params) {
  const { data } = await api.get('/admin/accounts', { params }); // UC-94
  return data;
}

export async function listClassOptions() {
  const { data } = await api.get('/admin/accounts/classes'); // UC-94 class filter
  return data.items;
}

export async function exportAccounts(params) {
  const res = await api.get('/admin/accounts/export', { params, responseType: 'blob' }); // UC-95
  saveBlob(res.data, fileName(res, 'educonnect-accounts.xlsx'));
}

export async function getAccount(id) {
  const { data } = await api.get(`/admin/accounts/${id}`);
  return data;
}

export async function updateIdentifiers(id, values) {
  const { data } = await api.put(`/admin/accounts/${id}/identifiers`, values); // UC-96
  return data;
}

// UC-97 / UC-98 – also used by School Manager on the student, teacher and parent detail screens.
export async function getSecurityState(id) {
  const { data } = await api.get(`/admin/accounts/${id}/security`);
  return data;
}

export async function resetPassword(id) {
  const { data } = await api.post(`/admin/accounts/${id}/reset-password`);
  return data; // { account, temporaryPassword }
}

export async function lockAccount(id, reason) {
  const { data } = await api.post(`/admin/accounts/${id}/lock`, { reason });
  return data;
}

export async function unlockAccount(id) {
  const { data } = await api.post(`/admin/accounts/${id}/unlock`);
  return data;
}

export async function clearTemporaryLock(id) {
  const { data } = await api.post(`/admin/accounts/${id}/clear-temporary-lock`);
  return data;
}

// ---------------------------------------------------------------- UC-99..101
export async function listSettings() {
  const { data } = await api.get('/admin/settings');
  return data;
}

export async function updateSettings(values) {
  const { data } = await api.put('/admin/settings', { values });
  return data;
}

export async function listMaintenance() {
  const { data } = await api.get('/admin/maintenance');
  return data;
}

export async function createMaintenance(body) {
  const { data } = await api.post('/admin/maintenance', body);
  return data;
}

export async function updateMaintenance(id, body) {
  const { data } = await api.put(`/admin/maintenance/${id}`, body);
  return data;
}

export async function endMaintenance(id) {
  const { data } = await api.post(`/admin/maintenance/${id}/end`);
  return data;
}

export async function cancelMaintenance(id) {
  const { data } = await api.post(`/admin/maintenance/${id}/cancel`);
  return data;
}

export async function currentMaintenance() {
  const { data } = await api.get('/maintenance/current');
  return data.maintenance;
}

// ---------------------------------------------------------------- password reset requests (FE-01 sends, FE-13 handles)
export async function listResetRequests(params) {
  const { data } = await api.get('/admin/password-reset-requests', { params });
  return data;
}

export async function rejectResetRequest(id) {
  const { data } = await api.post(`/admin/password-reset-requests/${id}/reject`);
  return data;
}
