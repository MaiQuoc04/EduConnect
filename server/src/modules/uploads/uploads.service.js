import crypto from 'node:crypto';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError, badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { getNumberSetting } from '../../utils/settings.js';
import {
  deleteFile,
  isDirectUploadAvailable,
  moveFile,
  objectInfo,
  readObjectStart,
  signedUploadUrl,
} from '../../utils/storage.js';
import { signPurposeToken, verifyPurposeToken } from '../../utils/token.js';

// Shared upload of attachments (owner: Anh, shared storage). Two steps, so big files (video up to 50 MB) go from the
// browser straight to Supabase Storage and never through this server's memory:
//   1. POST /uploads/sign     checks type and declared size, signs an upload URL into tmp/<userId>/<uuid>.<ext>
//   2. POST /uploads/confirm  checks the REAL object (size, Content-Type, first bytes) against what was declared,
//                             deletes it if anything differs, else moves it to its final folder.
// The attachments row is NOT written here: FE-05 / FE-06 / FE-08 insert it (utils/attachments.js) when they create
// the post / message, in the same transaction. A file left in tmp/ is an orphan: scripts/clean-orphan-uploads.js.

const MB = 1024 * 1024;
const TICKET_PURPOSE = 'UPLOAD';
const TICKET_LIFETIME = '2h'; // = lifetime of a Supabase signed upload URL

// Allowed types = the "Allowed MIME types" of the attachments bucket (database/README-storage.md, 15 types). Keep the
// two lists equal: a type allowed here but not in the bucket would be signed and then refused by Supabase.
// kind decides the size limit (business-rules §5: images / files ≤ upload.max_file_mb, videos ≤ upload.max_video_mb);
// ext: the extensions a file of this type may keep in its storage key (first = default); sniff: its first bytes.
const isOle = (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
const isZip = (b) => b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
const isText = (b) => b.length > 0 && !b.includes(0x00); // CSV: no NUL byte in the first 4 KB
const isIsoMedia = (b) => b.length >= 8 && ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(b.toString('latin1', 4, 8));
export const ATTACHMENT_TYPES = Object.freeze({
  'image/jpeg': { kind: 'image', ext: ['.jpg', '.jpeg'], sniff: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { kind: 'image', ext: ['.png'], sniff: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { kind: 'image', ext: ['.webp'], sniff: (b) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  'image/gif': { kind: 'image', ext: ['.gif'], sniff: (b) => b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)) },
  'video/mp4': { kind: 'video', ext: ['.mp4'], sniff: isIsoMedia },
  'video/webm': { kind: 'video', ext: ['.webm'], sniff: (b) => b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  'video/quicktime': { kind: 'video', ext: ['.mov'], sniff: isIsoMedia },
  'application/pdf': { kind: 'document', ext: ['.pdf'], sniff: (b) => b.subarray(0, 1024).includes('%PDF-') },
  'application/msword': { kind: 'document', ext: ['.doc'], sniff: isOle },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'document', ext: ['.docx'], sniff: isZip },
  // Browsers on Windows with Excel installed send .csv files as application/vnd.ms-excel (README-storage.md).
  'application/vnd.ms-excel': { kind: 'document', ext: ['.xls', '.csv'], sniff: (b) => isOle(b) || isText(b) },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'document', ext: ['.xlsx'], sniff: isZip },
  'application/vnd.ms-powerpoint': { kind: 'document', ext: ['.ppt'], sniff: isOle },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'document', ext: ['.pptx'], sniff: isZip },
  'text/csv': { kind: 'document', ext: ['.csv'], sniff: isText },
});

// Where a confirmed file goes (database/README-storage.md). yyyy/mm = month of the signing, so confirming twice gives
// the same key.
const TARGETS = Object.freeze({
  'school-post': ({ year, month, name }) => `school-posts/${year}/${month}/${name}`, // FE-08
  post: ({ year, month, name }) => `posts/${year}/${month}/${name}`, // FE-05 (FE-07 activities are class feed posts)
  message: ({ groupId, name }) => `messages/${groupId}/${name}`, // FE-06
});

function requireDirectUpload() {
  if (!isDirectUploadAvailable()) {
    // ASSUMPTION: with STORAGE_DRIVER=local there is nothing to sign; the endpoints answer a clear error instead of an
    // upload-through-the-server fallback (not built in stage 5, see the summary).
    throw new AppError(503, 'MSG_UPLOAD_FAILED', 'Direct upload needs STORAGE_DRIVER=supabase on the server.');
  }
}

async function maxMbFor(kind) {
  return kind === 'video' ? getNumberSetting('upload.max_video_mb', 50) : getNumberSetting('upload.max_file_mb', 10);
}

// The original name is only stored (attachments.file_name), never used in a path: no folders, no control characters.
function cleanFileName(value) {
  const name = typeof value === 'string' ? path.basename(value.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  if (!name) throw badRequest('MSG_REQUIRED', 'Please give the file name.');
  if (name.length > 255) throw badRequest('MSG_UPLOAD_FAILED', 'The file name must not exceed 255 characters.');
  return name;
}

/**
 * UC: shared upload, step 1. Checks what the client says it will upload, then signs an upload URL for
 * tmp/<userId>/<uuid><ext> in the attachments bucket (valid 2 hours).
 * Permission: any signed-in account except System Admin (business-rules §1: sees no content); a school post file only
 * as School Manager (§8: only SM posts). Everything that depends on the data (member of the group, may post in this
 * feed, the message is one's own…) is checked by FE-05 / FE-06 / FE-08 when the file is attached.
 */
export async function signUpload(user, { target, fileName, mimeType, sizeBytes, groupId } = {}) {
  requireDirectUpload();
  if (user.activeRole === 'SYSTEM_ADMIN') throw forbidden();
  if (!Object.hasOwn(TARGETS, target)) throw badRequest('MSG_UPLOAD_FAILED', 'target must be school-post, post or message.');
  if (target === 'school-post' && user.activeRole !== 'SCHOOL_MANAGER') throw forbidden();
  let group = null;
  if (target === 'message') {
    group = Number(groupId);
    if (!Number.isSafeInteger(group) || group < 1) throw badRequest('MSG_REQUIRED', 'groupId is required for a message file.');
  }
  const name = cleanFileName(fileName);
  const type = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  const rule = Object.hasOwn(ATTACHMENT_TYPES, type) ? ATTACHMENT_TYPES[type] : null;
  if (!rule) throw badRequest('MSG_UPLOAD_FAILED', 'This type of file is not allowed.', { reason: 'TYPE' });
  const size = Number(sizeBytes);
  if (!Number.isSafeInteger(size) || size < 1) throw badRequest('MSG_UPLOAD_FAILED', 'sizeBytes must be a positive integer.');
  const maxMb = await maxMbFor(rule.kind);
  if (size > maxMb * MB) throw badRequest('MSG_FILE_TOO_LARGE', `The file must not be larger than ${maxMb} MB.`, { maxMb });

  // Keep the file's own extension when it fits the type (a .csv sent as vnd.ms-excel stays .csv), else the default.
  const own = path.extname(name).toLowerCase();
  const ext = rule.ext.includes(own) ? own : rule.ext[0];
  const bucket = env.storage.buckets.attachments;
  const storageKey = `tmp/${user.userId}/${crypto.randomUUID()}${ext}`;
  const uploadUrl = await signedUploadUrl(bucket, storageKey);
  const now = new Date();
  // What was declared travels in a signed ticket (same JWT secret, purpose UPLOAD – never an access token), so
  // confirm can compare the real object with it without a table for pending uploads.
  const uploadTicket = signPurposeToken(
    TICKET_PURPOSE,
    {
      userId: user.userId,
      storageKey,
      target,
      groupId: group,
      mimeType: type,
      sizeBytes: size,
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1).padStart(2, '0'),
    },
    TICKET_LIFETIME,
  );
  // The client sends: PUT uploadUrl, header Content-Type: <mimeType>, body = the file.
  return { uploadUrl, storageKey, bucket, uploadTicket, method: 'PUT', contentType: type, maxMb };
}

/**
 * Step 2. The signed URL limits NOTHING (size, type): the client may have uploaded anything. Reads the real object
 * and checks it against the ticket and the current limits; on any difference the object is deleted (400). Then
 * moves it from tmp/ to its final folder. Confirming the same upload again returns the same result.
 * Returns { storageKey, bucket, fileName, mimeType, sizeBytes } – what the caller later passes to insertAttachments.
 */
export async function confirmUpload(user, { storageKey, fileName, uploadTicket } = {}) {
  requireDirectUpload();
  if (user.activeRole === 'SYSTEM_ADMIN') throw forbidden();
  const name = cleanFileName(fileName);
  if (typeof storageKey !== 'string' || !storageKey) throw badRequest('MSG_REQUIRED', 'storageKey is required.');
  // Only one's own temporary folder, whatever the ticket says.
  if (!storageKey.startsWith(`tmp/${user.userId}/`) || storageKey.includes('..')) throw forbidden();
  const ticket = typeof uploadTicket === 'string' ? verifyPurposeToken(TICKET_PURPOSE, uploadTicket) : null;
  if (!ticket) throw badRequest('MSG_UPLOAD_FAILED', 'The upload has expired. Please upload the file again.');
  if (ticket.userId !== user.userId || ticket.storageKey !== storageKey) throw forbidden();

  const bucket = env.storage.buckets.attachments;
  const finalKey = TARGETS[ticket.target]({ ...ticket, name: storageKey.slice(storageKey.lastIndexOf('/') + 1) });
  const result = { storageKey: finalKey, bucket, fileName: name, mimeType: ticket.mimeType, sizeBytes: ticket.sizeBytes };

  const info = await objectInfo(bucket, storageKey);
  if (!info) {
    // Already confirmed (second call): the object is in its final folder, with the size that was checked then.
    const moved = await objectInfo(bucket, finalKey);
    if (moved && moved.size === ticket.sizeBytes) return result;
    throw notFound('NOT_FOUND', 'The uploaded file was not found. Please upload it again.');
  }

  const rule = ATTACHMENT_TYPES[ticket.mimeType];
  const maxMb = await maxMbFor(rule.kind);
  const head = await readObjectStart(bucket, storageKey);
  let refusal = null;
  if (info.size > maxMb * MB) {
    refusal = badRequest('MSG_FILE_TOO_LARGE', `The file must not be larger than ${maxMb} MB.`, { maxMb });
  } else if (info.size !== ticket.sizeBytes) {
    refusal = badRequest('MSG_UPLOAD_FAILED', 'The uploaded file is not the one that was announced.', { reason: 'SIZE' });
  } else if ((info.mimeType ?? '').toLowerCase() !== ticket.mimeType || !head || !rule.sniff(head)) {
    refusal = badRequest('MSG_UPLOAD_FAILED', 'The content of the file does not match its type.', { reason: 'TYPE' });
  }
  if (refusal) {
    await deleteFile(bucket, storageKey);
    console.warn(`[uploads] refused ${storageKey} of user ${user.userId}: ${refusal.message} (declared ${ticket.mimeType}, ${ticket.sizeBytes} B; stored ${info.mimeType}, ${info.size} B)`);
    throw refusal;
  }
  if (!(await moveFile(bucket, storageKey, finalKey))) {
    // Two confirms at the same moment: the other one moved it.
    if ((await objectInfo(bucket, finalKey))?.size === ticket.sizeBytes) return result;
    throw notFound('NOT_FOUND', 'The uploaded file was not found. Please upload it again.');
  }
  return result;
}
