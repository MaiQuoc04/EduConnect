import { env } from '../../config/env.js';
import { badRequest } from '../../utils/AppError.js';
import * as service from './schoolposts.service.js';

// FE-08 School Feed (owner: Anh). Validates the request before anything reaches the database; SQL lives in the service.

const POST_TYPES = ['ANNOUNCEMENT', 'NEWS']; // school_posts.post_type CHECK
const MAX_Q_LENGTH = 100;
// ASSUMPTION: default 20 posts per page, at most 50 (a feed page; FE-02 lists allow 100).
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function invalid(field) {
  return badRequest('MSG_INVALID_PARAM', `Invalid value for "${field}".`, { field });
}

// Query values are strings; a repeated parameter (?page=1&page=2) arrives as an array and is rejected.
function optionalString(query, field) {
  const value = query[field];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw invalid(field);
  return value.trim();
}

function optionalInt(query, field, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  const value = optionalString(query, field);
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw invalid(field);
  const n = Number(value);
  if (n < min || n > max) throw invalid(field);
  return n;
}

// BIGINT ids arrive as JS numbers (db.js), so the id must be a positive safe integer.
function parseId(value, field) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > Number.MAX_SAFE_INTEGER) throw invalid(field);
  return Number(value);
}

// UC-58 View School Feed & News
export async function list(req, res) {
  const query = req.query ?? {};
  const postType = optionalString(query, 'postType');
  if (postType && !POST_TYPES.includes(postType)) throw invalid('postType');
  const q = optionalString(query, 'q');
  if (q && q.length > MAX_Q_LENGTH) throw invalid('q');
  const filters = {
    postType: postType || undefined,
    q: q || undefined,
    page: optionalInt(query, 'page', { fallback: 1 }),
    pageSize: optionalInt(query, 'pageSize', { max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
  };
  res.json(await service.listSchoolPosts(req.user, filters));
}

// UC-59 View School Post Detail
export async function detail(req, res) {
  res.json(await service.getSchoolPost(req.user, parseId(req.params.schoolPostId, 'schoolPostId')));
}

// --- UC-60..UC-63 body checks ------------------------------------------------------------------------------------

const MAX_TITLE_LENGTH = 255; // school_posts.title VARCHAR(255)
// Fields each write accepts. Any other key → 400 MSG_FIELD_NOT_EDITABLE with the refused names (as UC-09).
// UC-61: postType and sendNotification are refused on purpose (see updateSchoolPost in the service).
const CREATE_FIELDS = [
  'title', 'content', 'postType', 'sendNotification', 'gradeLevelIds', 'classIds', 'targetRoles', 'attachments',
];
const UPDATE_FIELDS = ['title', 'content', 'gradeLevelIds', 'classIds', 'targetRoles', 'attachments', 'removeAttachmentIds'];
const PIN_FIELDS = ['isPinned'];

function jsonBody(req, allowed) {
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('MSG_INVALID_PARAM', 'The request body must be a JSON object.', { field: 'body' });
  }
  const rejected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (rejected.length) {
    throw badRequest('MSG_FIELD_NOT_EDITABLE', 'These fields cannot be set here.', { fields: rejected });
  }
  return body;
}

// NFC so text typed with combining accents is stored like the same text typed precomposed. Lengths are counted in
// code points, as PostgreSQL does.
function cleanTitle(value) {
  if (typeof value !== 'string') throw invalid('title');
  const title = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  const length = [...title].length;
  if (length < 1 || length > MAX_TITLE_LENGTH) throw invalid('title');
  return title;
}

// ASSUMPTION: the content keeps its line breaks (only the ends are trimmed) and has no length limit of its own
// (TEXT; the JSON body is limited to 1 MB in app.js). Blank content is refused.
function cleanContent(value) {
  if (typeof value !== 'string') throw invalid('content');
  const content = value.normalize('NFC').trim();
  if (!content) throw invalid('content');
  return content;
}

// Optional list of BIGINT ids: JSON numbers that are positive safe integers; repeated ids are kept once.
function idList(body, field) {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((id) => Number.isSafeInteger(id) && id >= 1)) throw invalid(field);
  return [...new Set(value)];
}

/**
 * Optional targetRoles: an array of STUDENT / PARENT / TEACHER (any other value, or not an array → 400
 * MSG_INVALID_PARAM). Returned de-duplicated in service.TARGETABLE_ROLES order; [] = every role (left out, null and
 * [] alike).
 * ASSUMPTION: all three roles chosen = every role too, so it is stored as NULL like the default: one value for one
 * audience (the posts of before have NULL), and the summary does not list "Học sinh · Phụ huynh · Giáo viên".
 */
function roleList(body) {
  const value = body.targetRoles;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((role) => service.TARGETABLE_ROLES.includes(role))) {
    throw invalid('targetRoles');
  }
  const roles = service.TARGETABLE_ROLES.filter((role) => value.includes(role));
  return roles.length === service.TARGETABLE_ROLES.length ? [] : roles;
}

/**
 * Optional attachments of UC-60 / UC-61: the answers of POST /uploads/confirm, [{ storageKey, bucket, fileName, … }],
 * in the order they are shown. Only storageKey, bucket and fileName are kept: size and type are read from the stored
 * object by the service (the body's numbers are the client's). Checked here before anything else:
 *   - at most service.MAX_ATTACHMENTS → 400 MSG_TOO_MANY_ATTACHMENTS { max };
 *   - the key is a school feed file (school-posts/…, the folder /uploads/confirm moves a 'school-post' upload to),
 *     not one of FE-05 (posts/) or FE-06 (messages/), nor one still in tmp/ → 400 MSG_INVALID_PARAM;
 *   - the bucket is the attachments bucket; the same key twice → 400.
 */
function attachmentList(body) {
  const value = body.attachments;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid('attachments');
  if (value.length > service.MAX_ATTACHMENTS) {
    throw badRequest('MSG_TOO_MANY_ATTACHMENTS', `A school post can have at most ${service.MAX_ATTACHMENTS} files.`,
      { max: service.MAX_ATTACHMENTS });
  }
  const list = value.map((item) => {
    if (!item || typeof item !== 'object') throw invalid('attachments');
    const { storageKey, bucket, fileName } = item;
    if (
      typeof storageKey !== 'string' || !/^school-posts\/[\w./-]+$/.test(storageKey) || storageKey.includes('..') ||
      storageKey.length > 500 || bucket !== env.storage.buckets.attachments
    ) {
      throw invalid('attachments');
    }
    if (typeof fileName !== 'string' || !fileName.trim() || [...fileName.trim()].length > 255) throw invalid('attachments');
    return { storageKey, bucket, fileName: fileName.normalize('NFC').trim() };
  });
  if (new Set(list.map((f) => f.storageKey)).size !== list.length) throw invalid('attachments');
  return list;
}

// UC-60 Create School Post
export async function create(req, res) {
  const body = jsonBody(req, CREATE_FIELDS);
  if (!POST_TYPES.includes(body.postType)) throw invalid('postType');
  if (body.sendNotification !== undefined && typeof body.sendNotification !== 'boolean') {
    throw invalid('sendNotification');
  }
  const input = {
    title: cleanTitle(body.title),
    content: cleanContent(body.content),
    postType: body.postType,
    sendNotification: body.sendNotification, // undefined → default of the type (service)
    gradeLevelIds: idList(body, 'gradeLevelIds'),
    classIds: idList(body, 'classIds'),
    targetRoles: roleList(body),
    attachments: attachmentList(body),
  };
  res.status(201).json(await service.createSchoolPost(req.user, input));
}

// UC-61 Update School Post
export async function update(req, res) {
  const schoolPostId = parseId(req.params.schoolPostId, 'schoolPostId');
  const body = jsonBody(req, UPDATE_FIELDS);
  if (!Object.keys(body).length) throw badRequest('MSG_NO_FIELDS_TO_UPDATE', 'Send at least one field to update.');
  const changes = {};
  if ('title' in body) changes.title = cleanTitle(body.title);
  if ('content' in body) changes.content = cleanContent(body.content);
  // Lead OK 07/11/2026: the audience can be changed.
  // ASSUMPTION: gradeLevelIds and classIds are ONE audience (one choice on SCR-06): sending either of them replaces
  // all the targets, and the one left out counts as empty (null too). Sending neither keeps the audience.
  if ('gradeLevelIds' in body || 'classIds' in body) {
    changes.audience = { gradeLevelIds: idList(body, 'gradeLevelIds'), classIds: idList(body, 'classIds') };
  }
  // The role dimension is separate: sent → replaces the roles ([] / null = every role); left out → kept.
  if ('targetRoles' in body) changes.targetRoles = roleList(body);
  // Files: new ones added (as UC-60), removeAttachmentIds taken off (soft delete). The limit on the total is checked
  // in the service, which knows how many the post has.
  if ('attachments' in body) changes.attachments = attachmentList(body);
  if ('removeAttachmentIds' in body) changes.removeAttachmentIds = idList(body, 'removeAttachmentIds');
  res.json(await service.updateSchoolPost(req.user, schoolPostId, changes));
}

// Limits of the SCR-31 / SCR-06 file picker (count, sizes from system_settings, the 15 types).
export async function attachmentLimits(_req, res) {
  res.json(await service.getAttachmentLimits());
}

// UC-62 Delete School Post
export async function remove(req, res) {
  res.json(await service.deleteSchoolPost(req.user, parseId(req.params.schoolPostId, 'schoolPostId')));
}

// UC-63 Pin / Unpin School Post
export async function pin(req, res) {
  const schoolPostId = parseId(req.params.schoolPostId, 'schoolPostId');
  const body = jsonBody(req, PIN_FIELDS);
  if (typeof body.isPinned !== 'boolean') throw invalid('isPinned');
  res.json(await service.pinSchoolPost(req.user, schoolPostId, body.isPinned));
}

// --- UC-64..UC-66 (SCR-05) ---------------------------------------------------------------------------------------

const COMMENT_FIELDS = ['content', 'parentCommentId'];
// ASSUMPTION: a comment has at most 2000 characters, the limit of a chat message (business-rules §6); comments.content is
// TEXT and no rule sets a limit for the feed.
const MAX_COMMENT_LENGTH = 2000;

// UC-64 React to School Post: PUT likes, DELETE unlikes (both idempotent).
export async function like(req, res) {
  res.json(await service.setSchoolPostLike(req.user, parseId(req.params.schoolPostId, 'schoolPostId'), true));
}

export async function unlike(req, res) {
  res.json(await service.setSchoolPostLike(req.user, parseId(req.params.schoolPostId, 'schoolPostId'), false));
}

// UC-65 (reading the comments of SCR-05)
export async function listComments(req, res) {
  const schoolPostId = parseId(req.params.schoolPostId, 'schoolPostId');
  const query = req.query ?? {};
  const paging = {
    page: optionalInt(query, 'page', { fallback: 1 }),
    pageSize: optionalInt(query, 'pageSize', { max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
  };
  res.json(await service.listSchoolPostComments(req.user, schoolPostId, paging));
}

// UC-65 Comment on School Post. Line breaks are kept, the ends trimmed; blank → 400 MSG_REQUIRED.
export async function createComment(req, res) {
  const schoolPostId = parseId(req.params.schoolPostId, 'schoolPostId');
  const body = jsonBody(req, COMMENT_FIELDS);
  if (body.content !== undefined && body.content !== null && typeof body.content !== 'string') throw invalid('content');
  const content = (body.content ?? '').normalize('NFC').trim();
  if (!content) throw badRequest('MSG_REQUIRED', 'Please write a comment.', { field: 'content' });
  if ([...content].length > MAX_COMMENT_LENGTH) throw invalid('content');
  const { parentCommentId = null } = body;
  if (parentCommentId !== null && !(Number.isSafeInteger(parentCommentId) && parentCommentId >= 1)) {
    throw invalid('parentCommentId');
  }
  res.status(201).json(await service.createSchoolPostComment(req.user, schoolPostId, { content, parentCommentId }));
}

// UC-66 Delete School Post Comment
export async function removeComment(req, res) {
  const schoolPostId = parseId(req.params.schoolPostId, 'schoolPostId');
  const commentId = parseId(req.params.commentId, 'commentId');
  res.json(await service.deleteSchoolPostComment(req.user, schoolPostId, commentId));
}
