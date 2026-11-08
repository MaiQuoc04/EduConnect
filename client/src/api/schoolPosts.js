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

// UC-60 POST /school-posts { title, content, postType, sendNotification?, gradeLevelIds?, classIds? }
// -> 201 { post, attachments } (UC-59 shape). ANNOUNCEMENT without a grade or class -> 400 MSG_AUDIENCE_REQUIRED;
// a class outside the current school year -> 400 MSG_CLASS_NOT_FOUND { classIds }.
export async function createSchoolPost(body) {
  const { data } = await api.post('/school-posts', body);
  return data;
}

// UC-61 PATCH /school-posts/:schoolPostId -> { post, attachments }. Only title, content, gradeLevelIds, classIds are
// accepted (postType / sendNotification -> 400 MSG_FIELD_NOT_EDITABLE { fields }). gradeLevelIds and classIds are one
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
