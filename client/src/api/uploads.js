import axios from 'axios';
import { api } from './client.js';

// Shared upload of attachments (server: modules/uploads, owner Anh) for FE-05 Group Feed, FE-06 Messaging and FE-08
// School Feed. Three steps, so a big file goes from the browser straight to Supabase Storage, not through our server:
//   1. POST /uploads/sign     { target, fileName, mimeType, sizeBytes, groupId? }
//                             -> { uploadUrl, storageKey, bucket, uploadTicket, contentType }
//   2. PUT uploadUrl          body = the file, Content-Type = its type (Supabase; our token is NOT sent there)
//   3. POST /uploads/confirm  { storageKey, fileName, uploadTicket } -> { storageKey, bucket, fileName, mimeType, sizeBytes }
// The server checks the real object at step 3 (size, type, first bytes) and deletes it when it differs.
// What step 3 returns is what the feature sends with its post / message (UC-60 `attachments: [...]`); the
// attachments row is written by the feature, in the same transaction as the post / message.

/** Targets the server knows: the folder the file goes to and who may sign (School Manager only for 'school-post'). */
export const UPLOAD_TARGETS = Object.freeze({ SCHOOL_POST: 'school-post', GROUP_POST: 'post', MESSAGE: 'message' });

// Supabase answers errors as HTTP 400 with the real status in the body ({ statusCode: "413", error, message }).
function storageError(err) {
  if (axios.isCancel(err)) return { status: 0, code: 'CANCELLED', message: 'Upload cancelled.' };
  const data = err.response?.data ?? {};
  const status = Number(data.statusCode) || err.response?.status || 0;
  if (status === 413) return { status, code: 'MSG_UPLOAD_FAILED', message: 'The file is too large for the storage.' };
  if (!err.response) return { status: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the storage.' };
  return { status, code: 'MSG_UPLOAD_FAILED', message: data.message ?? 'The file could not be uploaded.' };
}

/**
 * Uploads one file through the three steps and resolves to { storageKey, bucket, fileName, mimeType, sizeBytes }.
 * Rejects with { status, code, message, details? } like api/client.js (code 'CANCELLED' when `signal` aborted it).
 * @param {File} file the file to send (already compressed for images: see utils/imageCompress.js)
 * @param {{ target: 'school-post' | 'post' | 'message', groupId?: number, fileName?: string, signal?: AbortSignal,
 *   onProgress?: (fraction: number) => void }} options fileName: the original name to keep (defaults to file.name;
 *   a compressed image is named <original>.webp, which is what should be stored)
 */
export async function uploadFile(file, { target, groupId, fileName = file.name, signal, onProgress } = {}) {
  const { data: signed } = await api.post(
    '/uploads/sign',
    { target, groupId, fileName, mimeType: file.type, sizeBytes: file.size },
    { signal },
  );
  try {
    // A plain axios call (not `api`): the request goes to Supabase and must not carry our Authorization header.
    await axios.put(signed.uploadUrl, file, {
      headers: { 'Content-Type': signed.contentType ?? file.type },
      signal,
      onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
    });
  } catch (err) {
    throw storageError(err);
  }
  const { data } = await api.post(
    '/uploads/confirm',
    { storageKey: signed.storageKey, fileName, uploadTicket: signed.uploadTicket },
    { signal },
  );
  return data;
}

/**
 * Link that downloads a signed attachment under its original name: Supabase reads `download` and answers with
 * Content-Disposition: attachment; filename*=UTF-8''… (Vietnamese names kept). The <a download> attribute does not
 * work across origins, hence the parameter.
 */
export function downloadUrl(url, fileName) {
  if (!url) return url;
  if (!/\/storage\/v1\/object\/sign\//.test(url)) return url; // a local /uploads/... file: the browser decides
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(fileName ?? '')}`;
}
