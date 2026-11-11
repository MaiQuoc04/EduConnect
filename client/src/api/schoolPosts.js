import { api } from './client.js';

// FE-08 School Feed API (owner: Anh). Business-rules §8; the server checks every permission and the audience.

// Drops empty values so the URL sent to the server only carries the filters in use.
function compact(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

// UC-58 GET /school-posts?postType=ANNOUNCEMENT|NEWS&q=&page=&pageSize= -> { items, page, pageSize, total }.
// Pinned first, then newest first (sorted by the server, never re-sorted here). pageSize at most 50.
export async function listSchoolPosts(params, { signal } = {}) {
  const { data } = await api.get('/school-posts', { params: compact(params), signal });
  return data;
}

// UC-59 GET /school-posts/:schoolPostId -> { post, attachments }. 404 MSG_SCHOOL_POST_NOT_FOUND also for a post
// outside the reader's audience (on purpose: nobody learns that it exists).
export async function getSchoolPost(schoolPostId, { signal } = {}) {
  const { data } = await api.get(`/school-posts/${encodeURIComponent(schoolPostId)}`, { signal });
  return data;
}

// UC-63 PATCH /school-posts/:schoolPostId/pin { isPinned } -> { post, attachments } (UC-59 shape). School Manager
// only; pinning NEWS -> 400 MSG_CANNOT_PIN_NEWS.
export async function setSchoolPostPinned(schoolPostId, isPinned) {
  const { data } = await api.patch(`/school-posts/${encodeURIComponent(schoolPostId)}/pin`, { isPinned });
  return data;
}

// UC-64 PUT / DELETE /school-posts/:schoolPostId/like -> { likeCount, likedByMe }. Both are idempotent (liking twice
// or unliking a post one did not like is 200). NEWS -> 400 MSG_CANNOT_REACT_NEWS.
export async function likeSchoolPost(schoolPostId) {
  const { data } = await api.put(`/school-posts/${encodeURIComponent(schoolPostId)}/like`);
  return data;
}

export async function unlikeSchoolPost(schoolPostId) {
  const { data } = await api.delete(`/school-posts/${encodeURIComponent(schoolPostId)}/like`);
  return data;
}

// GET /school-posts/attachment-limits (School Manager) -> { maxFiles, maxFileMb, maxVideoMb, types: [{ mimeType, kind,
// extensions }] }: the file picker of SCR-31 / SCR-06. Sizes come from system_settings at each call.
export async function getAttachmentLimits({ signal } = {}) {
  const { data } = await api.get('/school-posts/attachment-limits', { signal });
  return data;
}

// UC-60 POST /school-posts { title, content, postType, sendNotification?, gradeLevelIds?, classIds?, attachments? }
// -> 201 { post, attachments } (UC-59 shape). attachments = the /uploads/confirm answers (api/uploads.js), at most 10,
// in the order shown. ANNOUNCEMENT without a grade or class -> 400 MSG_AUDIENCE_REQUIRED; a class outside the current
// school year -> 400 MSG_CLASS_NOT_FOUND { classIds }; too many files -> 400 MSG_TOO_MANY_ATTACHMENTS { max }.
// UC-59 attachments: [{ attachmentId, fileName, mimeType, sizeBytes, url }] with url signed for one hour.
export async function createSchoolPost(body) {
  const { data } = await api.post('/school-posts', body);
  return data;
}

// UC-61 PATCH /school-posts/:schoolPostId -> { post, attachments }. Only title, content, gradeLevelIds, classIds,
// targetRoles, attachments (new files, as UC-60) and removeAttachmentIds (files taken off) are accepted
// (postType / sendNotification -> 400 MSG_FIELD_NOT_EDITABLE { fields }). gradeLevelIds and classIds are one
// audience: sending either replaces all the targets.
export async function updateSchoolPost(schoolPostId, changes) {
  const { data } = await api.patch(`/school-posts/${encodeURIComponent(schoolPostId)}`, changes);
  return data;
}

// UC-62 DELETE /school-posts/:schoolPostId -> { post, attachments } as it was just before (soft delete on the
// server; afterwards the post is 404 for everyone).
export async function deleteSchoolPost(schoolPostId) {
  const { data } = await api.delete(`/school-posts/${encodeURIComponent(schoolPostId)}`);
  return data;
}

// Grade levels for the UC-60 / UC-61 audience picker, read from FE-04's GET /classes/grade-levels (Khanh, School
// Manager only) -> [{ gradeLevelId, gradeLevelName }] sorted by name ("10", "11", "12"). No FE-04 client helper
// exists for it (FE-04 pages call api.get directly), so this is a read-only wrapper; the endpoint is not changed.
export async function getGradeLevelOptions({ signal } = {}) {
  const { data } = await api.get('/classes/grade-levels', { signal });
  return data;
}

// UC-65 GET /school-posts/:schoolPostId/comments?page=&pageSize= (pageSize at most 50)
// -> { items, page, pageSize, total, commentCount }. items = a tree paged by TOP-LEVEL comment (oldest first), each with
// all its replies at every level in `replies` (oldest first). total = top-level comments; commentCount = the post's
// count as UC-58 / UC-59 show it. A deleted comment stays only while a reply below it is visible (content and author
// null, isDeleted true). NEWS -> an empty page.
export async function listSchoolPostComments(schoolPostId, params, { signal } = {}) {
  const { data } = await api.get(`/school-posts/${encodeURIComponent(schoolPostId)}/comments`, {
    params: compact(params),
    signal,
  });
  return data;
}

// UC-65 POST /school-posts/:schoolPostId/comments { content, parentCommentId? } -> 201 the new comment (same fields as
// a node of the list, replies: [], canDelete: true). No commentCount in this answer. Reply to a deleted comment ->
// 409 MSG_PARENT_COMMENT_DELETED; parent of another post -> 400 MSG_INVALID_PARENT_COMMENT; NEWS -> 400
// MSG_CANNOT_COMMENT_NEWS; blank -> 400 MSG_REQUIRED; over 2000 characters -> 400 MSG_INVALID_PARAM.
export async function createSchoolPostComment(schoolPostId, body) {
  const { data } = await api.post(`/school-posts/${encodeURIComponent(schoolPostId)}/comments`, body);
  return data;
}

// UC-66 DELETE /school-posts/:schoolPostId/comments/:commentId -> { commentId, isDeleted: true, commentCount }.
// Soft delete; replies stay. Not one's own (and not School Manager) -> 403 FORBIDDEN; gone -> 404 MSG_COMMENT_NOT_FOUND.
export async function deleteSchoolPostComment(schoolPostId, commentId) {
  const { data } = await api.delete(
    `/school-posts/${encodeURIComponent(schoolPostId)}/comments/${encodeURIComponent(commentId)}`,
  );
  return data;
}
