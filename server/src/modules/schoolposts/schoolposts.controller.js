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
// UC-61: postType, sendNotification and the audience are refused on purpose (see updateSchoolPost in the service).
const CREATE_FIELDS = ['title', 'content', 'postType', 'sendNotification', 'gradeLevelIds', 'classIds'];
const UPDATE_FIELDS = ['title', 'content'];
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
  res.json(await service.updateSchoolPost(req.user, schoolPostId, changes));
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
