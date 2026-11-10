import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { AppError, badRequest, notFound } from './AppError.js';

// File storage behind one small API, so callers never know where files live (Supabase Storage chosen 09/11/2026,
// buckets in database/README-storage.md).
// - STORAGE_DRIVER=local (default, development): files on this server's disk (UPLOAD_DIR), served at /uploads.
// - STORAGE_DRIVER=supabase: Supabase Storage through its REST API with Node's built-in fetch (no SDK: we only need
//   upload, delete, sign and sign-upload, each one HTTP call).
// An object key is the same in both drivers (e.g. avatars/<uuid>.webp): on disk it is the path under UPLOAD_DIR,
// in Supabase the path inside the bucket. The local driver ignores the bucket (keys of different buckets use
// different first folders: avatars/, school-posts/, posts/, messages/).
// The server key never leaves this module: not logged, not in any error sent to the client.
export const uploadRoot = path.resolve(process.cwd(), env.uploadDir);

const isSupabase = () => env.storage.driver === 'supabase';

// TTL of links to private files: long enough to read a feed or a chat, short enough that a leaked link soon dies.
export const SIGNED_URL_TTL_SECONDS = 3600;

// ASSUMPTION: per-bucket size limits as set by hand on Supabase (database/README-storage.md). Only used to tell the
// user the limit when the bucket refuses a file as too large; the server's own limits come from system_settings.
const BUCKET_MAX_MB = { [env.storage.buckets.avatars]: 5, [env.storage.buckets.attachments]: 50 };

// Content-Type sent to Supabase (the bucket checks it against its allowed MIME types). Extensions as in
// database/README-storage.md; anything else is sent as octet-stream and refused by the bucket.
const MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
};

export function mimeTypeOf(extension) {
  return MIME_BY_EXTENSION[String(extension).toLowerCase()] ?? 'application/octet-stream';
}

// Saves a PUBLIC file (today only avatars, UC-06) and returns the URL to store in the DB.
// local:    UPLOAD_DIR/<folder>/<uuid><ext>, returns /uploads/<folder>/<uuid><ext> (unchanged behaviour).
// supabase: object <folder>/<uuid><ext> in the public avatars bucket, returns its absolute public URL.
// ASSUMPTION: the key is <folder>/<uuid><ext>, not <userId>/<uuid><ext> as README-storage.md says, because the
// signature has no user id and must stay as it is (account.service.js calls it). The random UUID keeps the URL
// unguessable all the same.
export async function saveFile(folder, buffer, extension) {
  const key = `${folder}/${crypto.randomUUID()}${extension}`;
  if (!isSupabase()) {
    const file = localPath(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buffer);
    return `/uploads/${key}`;
  }
  const bucket = env.storage.buckets.avatars;
  const res = await storageRequest('POST', `object/${bucket}/${encodeKey(key)}`, {
    body: buffer,
    // 1 hour (supabase-js default): the CDN keeps serving a public file this long after it is deleted.
    headers: { 'Content-Type': mimeTypeOf(extension), 'Cache-Control': 'max-age=3600', 'x-upsert': 'false' },
  });
  if (!res.ok) throw uploadError(res, bucket);
  return publicUrl(bucket, key);
}

// Deletes one object. Deleting something that does not exist is a success (safe to call twice).
// bucket null = a file on this server's disk (an old /uploads/... URL, see keyFromUrl), whatever the driver.
export async function deleteFile(bucket, key) {
  if (!key) return;
  if (!isSupabase() || !bucket) {
    await fs.rm(localPath(key), { force: true });
    return;
  }
  // The bulk endpoint answers 200 with the list of removed objects, empty when the key did not exist.
  const res = await storageRequest('DELETE', `object/${bucket}`, {
    body: JSON.stringify({ prefixes: [key] }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw storageUnavailable(res, `delete ${bucket}/${key}`);
}

// Short-lived link to a file in a PRIVATE bucket (attachments). local: the /uploads/... URL (no signing on disk).
export async function signedUrl(bucket, key, ttlSeconds = SIGNED_URL_TTL_SECONDS) {
  if (!isSupabase()) return `/uploads/${encodeKey(key)}`;
  const expiresIn = Number(ttlSeconds);
  if (!Number.isInteger(expiresIn) || expiresIn < 1) throw new Error('signedUrl: ttlSeconds must be a positive integer');
  const res = await storageRequest('POST', `object/sign/${bucket}/${encodeKey(key)}`, {
    body: JSON.stringify({ expiresIn }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (isNotFound(res)) throw notFound('NOT_FOUND', 'The file was not found.');
  if (!res.ok || !res.data?.signedURL) throw storageUnavailable(res, `sign ${bucket}/${key}`);
  return `${env.storage.supabaseUrl}/storage/v1${res.data.signedURL}`;
}

// URL the CLIENT uploads one file to directly (PUT, body = the file, header Content-Type = its MIME type), so large
// videos do not pass through this server's memory. Supabase makes it valid for 2 hours and for this key only; the
// bucket still checks size and MIME type. Returns null with the local driver: there is nothing to sign, so the
// caller falls back to uploading through the server (a null is easier to branch on than an error).
export async function signedUploadUrl(bucket, key) {
  if (!isSupabase()) return null;
  const res = await storageRequest('POST', `object/upload/sign/${bucket}/${encodeKey(key)}`, {
    headers: { 'x-upsert': 'false' },
  });
  if (!res.ok || !res.data?.url) throw storageUnavailable(res, `sign upload ${bucket}/${key}`);
  return `${env.storage.supabaseUrl}/storage/v1${res.data.url}`;
}

// Finds bucket + key from a URL this module returned (users.avatar_url), so the file can be deleted:
//   /uploads/<key>                                              -> { bucket: null, key }  (file on disk)
//   <SUPABASE_URL>/storage/v1/object/public/<bucket>/<key>      -> { bucket, key }
// Anything else (empty, another site, a signed link) -> null: never delete what we cannot identify.
export function keyFromUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  const decode = (s) => {
    try {
      return s.split('/').map(decodeURIComponent).join('/');
    } catch {
      return null;
    }
  };
  if (url.startsWith('/uploads/')) {
    const key = decode(url.slice('/uploads/'.length).split(/[?#]/)[0]);
    return key && isSafeKey(key) ? { bucket: null, key } : null;
  }
  const base = env.storage.supabaseUrl && `${env.storage.supabaseUrl}/storage/v1/object/public/`;
  if (base && url.startsWith(base)) {
    const rest = url.slice(base.length).split(/[?#]/)[0];
    const slash = rest.indexOf('/');
    if (slash <= 0) return null;
    const key = decode(rest.slice(slash + 1));
    return key && isSafeKey(key) ? { bucket: decodeURIComponent(rest.slice(0, slash)), key } : null;
  }
  return null;
}

// ---- helpers ----------------------------------------------------------------------------------------------------

function isSafeKey(key) {
  return !key.split('/').some((part) => part === '' || part === '.' || part === '..') && !key.includes('\\');
}

// Path on disk for a key; refuses anything that would leave UPLOAD_DIR.
function localPath(key) {
  const file = path.resolve(uploadRoot, key);
  if (!isSafeKey(key) || !file.startsWith(uploadRoot + path.sep)) throw new Error(`Invalid storage key: ${key}`);
  return file;
}

function encodeKey(key) {
  return String(key).split('/').map(encodeURIComponent).join('/');
}

function publicUrl(bucket, key) {
  return `${env.storage.supabaseUrl}/storage/v1/object/public/${bucket}/${encodeKey(key)}`;
}

// One call to the Storage REST API. Never throws: an HTTP or network error comes back as { ok: false } and the
// caller decides. The key is sent in both the apikey and Authorization headers, like supabase-js does.
async function storageRequest(method, apiPath, { body, headers = {} } = {}) {
  const key = env.storage.serviceRoleKey;
  let response;
  try {
    response = await fetch(`${env.storage.supabaseUrl}/storage/v1/${apiPath}`, {
      method,
      body,
      headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    return { ok: false, httpStatus: 0, status: 0, data: { error: 'unreachable', message: `${err.name}: ${err.message}` } };
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  // Storage reports some errors as HTTP 400 with the real status in the body ({ statusCode: "404", error, message }).
  const status = Number(data?.statusCode) || response.status;
  return { ok: response.ok, httpStatus: response.status, status, data };
}

function isNotFound(res) {
  return !res.ok && (res.status === 404 || /not.?found/i.test(`${res.data?.error} ${res.data?.message}`));
}

function describe(res) {
  return `HTTP ${res.httpStatus}${res.status !== res.httpStatus ? ` (${res.status})` : ''} ${res.data?.error ?? ''}: ${
    res.data?.message ?? ''
  }`.trim();
}

function logRefusal(res, action) {
  const hint = [401, 403].includes(res.status) || /jwt|api key|unauthori[sz]ed|signature/i.test(describe(res))
    ? ' – check SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in .env'
    : '';
  console.error(`[storage] ${action} refused: ${describe(res)}${hint}`);
}

// Upload refused: too large / wrong type are the user's file (400, bucket limits = the second check after the
// server's own); anything else (wrong key, bucket missing, Supabase down) is ours (503) and only logged here.
function uploadError(res, bucket) {
  if (res.status === 413 || /too large|exceeded the maximum/i.test(describe(res))) {
    const maxMb = BUCKET_MAX_MB[bucket];
    return maxMb
      ? badRequest('MSG_FILE_TOO_LARGE', `The file must not be larger than ${maxMb} MB.`, { maxMb })
      : badRequest('MSG_UPLOAD_FAILED', 'The file is too large.');
  }
  if (res.status === 415 || /mime/i.test(describe(res))) {
    return badRequest('MSG_UPLOAD_FAILED', 'This type of file is not allowed.');
  }
  logRefusal(res, `upload to ${bucket}`);
  return new AppError(503, 'MSG_UPLOAD_FAILED', 'The file could not be stored. Please try again.');
}

// Sign / delete refused for a reason that is not the user's: logged here, a plain server error for the client.
function storageUnavailable(res, action) {
  logRefusal(res, action);
  return new AppError(503, 'SERVER_ERROR', 'File storage is not available. Please try again.');
}

// Detects JPEG / PNG / WebP from the file content (the browser-supplied MIME type can be wrong).
export function detectImageType(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png';
  }
  if (buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return '.webp';
  }
  return null;
}
