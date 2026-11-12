import { badRequest } from './AppError.js';

// Request checks shared by the controllers, so they stop being copied into each module (iteration-plan It2 clean-up:
// the same helpers live in students / parents / schoolposts controllers). New code uses these; existing modules move
// over when their owners touch them.

export function invalid(field) {
  return badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
}

// Query values are strings; a repeated parameter (?page=1&page=2) arrives as an array and is rejected.
export function optionalString(query, field) {
  const value = query?.[field];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw invalid(field);
  return value.trim();
}

export function optionalInt(query, field, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw invalid(field);
  const n = Number(value);
  if (n < min || n > max) throw invalid(field);
  return n;
}

export function optionalEnum(query, field, allowed, fallback) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return fallback;
  if (!allowed.includes(value)) throw invalid(field);
  return value;
}

// BIGINT ids arrive as JS numbers (db.js), so an id must be a positive safe integer. Accepts a URL segment (string)
// or a JSON number.
export function parseId(value, field) {
  if (Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) throw invalid(field);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw invalid(field);
  return n;
}

// The JSON body as an object; any key outside `allowed` → 400 MSG_FIELD_NOT_EDITABLE with the refused names.
export function jsonBody(req, allowed) {
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('MSG_INVALID_PARAM', 'The request body must be a JSON object.', { field: 'body' });
  }
  const rejected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (rejected.length) throw badRequest('MSG_FIELD_NOT_EDITABLE', 'These fields cannot be set here.', { fields: rejected });
  return body;
}

export function requiredBoolean(body, field) {
  if (typeof body[field] !== 'boolean') throw invalid(field);
  return body[field];
}

/**
 * Free text typed by a user (post, comment): NFC (text typed with combining accents is stored like the same text typed
 * precomposed), ends trimmed, line breaks kept. Missing or blank → 400 MSG_REQUIRED; longer than max code points (as
 * PostgreSQL counts) → 400 MSG_TEXT_TOO_LONG with { field, max }.
 */
export function requiredText(body, field, max) {
  const value = body[field];
  if (value !== undefined && value !== null && typeof value !== 'string') throw invalid(field);
  const text = (value ?? '').normalize('NFC').trim();
  if (!text) throw badRequest('MSG_REQUIRED', `"${field}" is required.`, { field });
  if ([...text].length > max) {
    throw badRequest('MSG_TEXT_TOO_LONG', `"${field}" has more than ${max} characters.`, { field, max });
  }
  return text;
}

/**
 * Files sent with a post: the answers of POST /uploads/confirm, [{ storageKey, bucket, fileName, … }], in the order
 * shown. Only storageKey, bucket and fileName are kept (size and type are read from the stored object later). Missing
 * → []. More than max → 400 MSG_TOO_MANY_ATTACHMENTS { max }; a key outside `folder` (another feature's, or one still
 * in tmp/), another bucket, a blank or too long name, the same key twice → 400 MSG_INVALID_PARAM.
 */
export function uploadedFiles(body, field, { folder, bucket, max }) {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(field);
  if (value.length > max) throw badRequest('MSG_TOO_MANY_ATTACHMENTS', `At most ${max} files can be attached.`, { max });
  const list = value.map((item) => {
    if (!item || typeof item !== 'object') throw invalid(field);
    const { storageKey, bucket: itemBucket, fileName } = item;
    const keyOk =
      typeof storageKey === 'string' &&
      storageKey.length <= 500 &&
      storageKey.startsWith(folder) &&
      /^[\w./-]+$/.test(storageKey) &&
      !storageKey.includes('..');
    if (!keyOk) throw invalid(field);
    if (itemBucket !== bucket) throw invalid(field);
    if (typeof fileName !== 'string' || !fileName.trim() || [...fileName.trim()].length > 255) throw invalid(field);
    return { storageKey, bucket, fileName: fileName.normalize('NFC').trim() };
  });
  if (new Set(list.map((f) => f.storageKey)).size !== list.length) throw invalid(field);
  return list;
}

// A list of ids in the body (e.g. removeAttachmentIds): missing → []; duplicates dropped.
export function idList(body, field) {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(field);
  return [...new Set(value.map((v) => parseId(v, field)))];
}
