import { pool } from '../config/db.js';
import { AppError, badRequest } from './AppError.js';
import { objectUrl, SIGNED_URL_TTL_SECONDS, signedUrl } from './storage.js';

// Files attached to a post or a message – the data layer shared by FE-05 Group Feed (posts, owner Khanh), FE-06
// Messaging (messages, owner Khanh) and FE-08 School Feed (school_posts, owner Anh). An attachments row has exactly one
// of post_id / school_post_id / message_id (schema CHECK). Every function takes a "target" naming that column:
//
//   { column: 'post_id',        id: 34 }   FE-05
//   { column: 'message_id',     id: 56 }   FE-06
//   { column: 'school_post_id', id: 12 }   FE-08
//
// Same contract as utils/feedInteractions.js: these functions only read and write rows and check NOTHING about who
// may do it (who may post, see a post, write in a group…). The caller checks the post / message first, then calls
// these – inside its transaction (pass the transaction client as db), so a post and its files are created together.
//
// How a file gets here (modules/uploads): POST /uploads/sign -> the client PUTs the file into tmp/<userId>/ ->
// POST /uploads/confirm checks the real object and moves it to its final folder -> the caller inserts the row with the
// { storageKey, bucket, fileName, mimeType, sizeBytes } that confirm returned.
// Rules that are the same for every feature (business-rules §5, §14):
//   - The file lives in the PRIVATE attachments bucket; the row keeps bucket + storage_key, and a short-lived link is
//     signed every time the row is read (listAttachments). file_url is the unsigned URL, for reference only.
//   - Rows are soft deleted (deleted_at); the object stays in the bucket, but nobody gets a link to it any more.

// The only three column names that ever reach the SQL text (a column cannot be a $n placeholder).
export const ATTACHMENT_COLUMNS = Object.freeze({ GROUP_POST: 'post_id', MESSAGE: 'message_id', SCHOOL_POST: 'school_post_id' });
const ALLOWED_COLUMNS = new Set(Object.values(ATTACHMENT_COLUMNS));

// Folder of the bucket each column's files are confirmed into (database/README-storage.md): a key from another
// feature, or one still in tmp/ (not confirmed), is refused.
const FOLDER_BY_COLUMN = { post_id: 'posts/', message_id: 'messages/', school_post_id: 'school-posts/' };

function columnOf(target) {
  if (!target || !ALLOWED_COLUMNS.has(target.column)) {
    throw new Error(`attachments: unknown target column ${target?.column}`); // programming error -> 500
  }
  return target.column;
}

function idOf(target) {
  const id = Number(target.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`attachments: invalid target id ${target.id}`);
  return id;
}

/**
 * Inserts the attachments of one post / message (all rows in one statement). Each row is what POST /uploads/confirm
 * returned plus who uploaded it: { storageKey, bucket, fileName, mimeType, sizeBytes, uploadedBy }. A row without
 * storageKey (local disk) needs fileUrl instead. FE-05 passes { column: 'post_id', id }, FE-06
 * { column: 'message_id', id }, FE-08 { column: 'school_post_id', id }.
 * Refuses (400) a key that was not confirmed into this feature's folder, and (409 DUPLICATE) a file that is already
 * attached somewhere: one uploaded file belongs to one post or message.
 * @param {{ column: 'post_id' | 'message_id' | 'school_post_id', id: number }} target
 * @param {Array<{ storageKey?: string, bucket?: string, fileUrl?: string, fileName: string, mimeType: string,
 *   sizeBytes: number, uploadedBy: number }>} rows
 * @returns {Promise<number[]>} the new attachment ids, in the order of rows
 */
export async function insertAttachments(target, rows, db = pool) {
  const column = columnOf(target);
  const id = idOf(target);
  if (!Array.isArray(rows) || !rows.length) return [];
  const clean = rows.map((row) => cleanRow(row, column));
  const keyed = clean.filter((r) => r.storageKey);
  if (new Set(keyed.map((r) => `${r.bucket}/${r.storageKey}`)).size !== keyed.length) {
    throw new AppError(409, 'DUPLICATE', 'The same file is attached twice.');
  }
  if (keyed.length) {
    const { rows: taken } = await db.query(
      `SELECT 1 FROM attachments
       WHERE (bucket, storage_key) IN (SELECT * FROM unnest($1::varchar[], $2::varchar[])) AND deleted_at IS NULL
       LIMIT 1`,
      [keyed.map((r) => r.bucket), keyed.map((r) => r.storageKey)],
    );
    if (taken.length) throw new AppError(409, 'DUPLICATE', 'This file is already attached.');
  }
  const { rows: inserted } = await db.query(
    `INSERT INTO attachments (${column}, file_url, file_name, mime_type, size_bytes, uploaded_by, storage_key, bucket, created_at)
     SELECT $1, u.file_url, u.file_name, u.mime_type, u.size_bytes, u.uploaded_by, u.storage_key, u.bucket, NOW()
     FROM unnest($2::varchar[], $3::varchar[], $4::varchar[], $5::bigint[], $6::bigint[], $7::varchar[], $8::varchar[])
          WITH ORDINALITY AS u(file_url, file_name, mime_type, size_bytes, uploaded_by, storage_key, bucket, ord)
     ORDER BY u.ord
     RETURNING attachment_id AS "attachmentId"`,
    [
      id,
      clean.map((r) => r.fileUrl),
      clean.map((r) => r.fileName),
      clean.map((r) => r.mimeType),
      clean.map((r) => r.sizeBytes),
      clean.map((r) => r.uploadedBy),
      clean.map((r) => r.storageKey),
      clean.map((r) => r.bucket),
    ],
  );
  return inserted.map((r) => r.attachmentId);
}

function cleanRow(row, column) {
  const fileName = typeof row?.fileName === 'string' ? row.fileName.trim() : '';
  const mimeType = typeof row?.mimeType === 'string' ? row.mimeType.trim().toLowerCase() : '';
  const sizeBytes = Number(row?.sizeBytes);
  const uploadedBy = Number(row?.uploadedBy);
  if (!fileName || fileName.length > 255 || !mimeType || mimeType.length > 100) {
    throw badRequest('MSG_UPLOAD_FAILED', 'Each attachment needs a file name (max 255) and a MIME type.');
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !Number.isSafeInteger(uploadedBy) || uploadedBy < 1) {
    throw new Error('attachments: sizeBytes and uploadedBy must be integers'); // caller bug -> 500
  }
  const storageKey = row.storageKey ? String(row.storageKey) : null;
  const bucket = row.bucket ? String(row.bucket) : null;
  if (Boolean(storageKey) !== Boolean(bucket)) throw new Error('attachments: storageKey and bucket go together');
  if (storageKey) {
    if (!storageKey.startsWith(FOLDER_BY_COLUMN[column]) || storageKey.length > 500 || storageKey.includes('..')) {
      throw badRequest('MSG_UPLOAD_FAILED', 'This file was not uploaded for this place. Please upload it again.');
    }
    return { fileName, mimeType, sizeBytes, uploadedBy, storageKey, bucket, fileUrl: objectUrl(bucket, storageKey) };
  }
  const fileUrl = typeof row.fileUrl === 'string' ? row.fileUrl : '';
  if (!fileUrl || fileUrl.length > 500) throw new Error('attachments: a row without storageKey needs fileUrl');
  return { fileName, mimeType, sizeBytes, uploadedBy, storageKey: null, bucket: null, fileUrl };
}

/**
 * Attachments of one post / message that are not deleted, oldest first, each with a link signed NOW from its
 * storage_key (private bucket, valid ttlSeconds, default 3600). A row without storage_key (local disk) gives its
 * file_url. If one file cannot be signed (object missing), its url is null and the others are still returned.
 * FE-05 passes { column: 'post_id', id }, FE-06 { column: 'message_id', id }, FE-08 { column: 'school_post_id', id }.
 * @returns {Promise<Array<{ attachmentId: number, fileName: string, mimeType: string, sizeBytes: number,
 *   url: string | null, uploadedBy: number, createdAt: string }>>}
 */
export async function listAttachments(target, db = pool, { ttlSeconds = SIGNED_URL_TTL_SECONDS } = {}) {
  const column = columnOf(target);
  const { rows } = await db.query(
    `SELECT attachment_id AS "attachmentId", file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes",
            file_url AS "fileUrl", storage_key AS "storageKey", bucket, uploaded_by AS "uploadedBy", created_at AS "createdAt"
     FROM attachments
     WHERE ${column} = $1 AND deleted_at IS NULL
     ORDER BY attachment_id`,
    [idOf(target)],
  );
  return Promise.all(
    rows.map(async ({ fileUrl, storageKey, bucket, ...row }) => {
      if (!storageKey) return { ...row, url: fileUrl };
      try {
        return { ...row, url: await signedUrl(bucket, storageKey, ttlSeconds) };
      } catch (err) {
        console.error(`[attachments] cannot sign attachment ${row.attachmentId}: ${err.message}`);
        return { ...row, url: null };
      }
    }),
  );
}

/**
 * Soft deletes every attachment of one post / message (business-rules §14: deleted_at, never DELETE). The objects
 * stay in the bucket; no link is signed for them any more. Call it in the same transaction that deletes the post /
 * message. FE-05 passes { column: 'post_id', id }, FE-06 { column: 'message_id', id }, FE-08 { column: 'school_post_id', id }.
 * @returns {Promise<number>} how many rows were deleted now
 */
export async function softDeleteAttachments(target, db = pool) {
  const column = columnOf(target);
  const { rowCount } = await db.query(
    `UPDATE attachments SET deleted_at = NOW() WHERE ${column} = $1 AND deleted_at IS NULL`,
    [idOf(target)],
  );
  return rowCount;
}

/**
 * Attachments of many posts / messages in one query: Map id → number of attachments not deleted. Ids with none are
 * missing. For lists (feed, chat). FE-05 passes 'post_id', FE-06 'message_id', FE-08 'school_post_id'.
 * @param {'post_id' | 'message_id' | 'school_post_id'} column
 * @param {number[]} ids
 * @returns {Promise<Map<number, number>>}
 */
export async function countAttachments(column, ids, db = pool) {
  columnOf({ column });
  if (!ids?.length) return new Map();
  const { rows } = await db.query(
    `SELECT ${column} AS "id", COUNT(*) AS "count"
     FROM attachments
     WHERE ${column} = ANY($1::bigint[]) AND deleted_at IS NULL
     GROUP BY ${column}`,
    [ids],
  );
  return new Map(rows.map((r) => [r.id, r.count]));
}
