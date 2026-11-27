import { api } from './client.js';

// Moderation (FE-08, owner Anh, 25/11/2026) – the School Manager's "Quy chuẩn cộng đồng" screen and the message
// report queue. Server: /api/v1/moderation (server/src/modules/moderation). School Manager only; the server checks.

// Empty filter values are left out of the query string.
const compact = (params = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));

const get = async (path, params, config = {}) => (await api.get(path, { params: compact(params), ...config })).data;

// --- statistics (no content) ---
export const listViolators = (params, { signal } = {}) => get('/moderation/violations', params, { signal });
export const listByClass = (params, { signal } = {}) => get('/moderation/violations/by-class', params, { signal });
export const getUserHistory = (userId, { signal } = {}) => get(`/moderation/violations/users/${userId}`, {}, { signal });

/** Downloads the violators of the current filters as an .xlsx. */
export async function exportViolators(params) {
  const res = await api.get('/moderation/violations/export', { params: compact(params), responseType: 'blob' });
  const name = /filename="([^"]+)"/.exec(res.headers['content-disposition'] ?? '')?.[1] ?? 'vi-pham.xlsx';
  const url = URL.createObjectURL(res.data);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- one piece of content (logged by the server), unhide ---
export const getViolationContent = (id) => get(`/moderation/violations/${id}/content`);
export const unhideViolation = async (id, reason) => (await api.post(`/moderation/violations/${id}/unhide`, { reason })).data;

// --- rules ---
export const listRules = (params, { signal } = {}) => get('/moderation/rules', params, { signal });
export const createRule = async (rule) => (await api.post('/moderation/rules', rule)).data;
export const updateRule = async (id, changes) => (await api.patch(`/moderation/rules/${id}`, changes)).data;
export const deleteRule = async (id) => (await api.delete(`/moderation/rules/${id}`)).data;
export const testRules = async (text) => (await api.post('/moderation/rules/test', { text })).data;

// --- message reports ---
export const getReportSummary = () => get('/moderation/message-reports/summary');
export const listMessageReports = (params, { signal } = {}) => get('/moderation/message-reports', params, { signal });
/** The reported message alone (open report only; not logged). */
export const getReportedMessage = (messageId) => get(`/moderation/message-reports/${messageId}`);
/** "Xem hội thoại xung quanh": 6 messages before and after it, with a required reason (logged by the server). */
export const readReportContext = async (messageId, reason) =>
  (await api.post(`/moderation/message-reports/${messageId}/context`, { reason })).data;
export const resolveMessageReport = async (messageId, action, supportNote) =>
  (await api.patch(`/moderation/message-reports/${messageId}`, supportNote === undefined ? { action } : { action, supportNote })).data;

/** Tells the menu badge to read the counts again (after a decision on this page). */
export const MODERATION_CHANGED = 'moderation:changed';
export const announceModerationChange = () => window.dispatchEvent(new Event(MODERATION_CHANGED));
