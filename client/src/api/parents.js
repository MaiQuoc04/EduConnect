import { api } from './client.js';

// FE-14 Parent Management API (owner: Anh). School Manager only (the server checks the active role).

// Drops empty values so the URL sent to the server only carries the filters in use (same as api/students.js).
function compact(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false),
  );
}

// UC-104 GET /parents?q=&hasChildren=yes|no&accountStatus=ACTIVE|LOCKED&page=&pageSize=
// -> { items, page, pageSize, total }. item: { parentId, userId, fullName, avatarUrl, phone, email, occupation,
// address, accountStatus, childrenCount, childrenSummary: [{ studentId, studentCode, fullName }] }.
// q is a name ("contains", accents and case ignored) or, when it looks like a phone number, a phone ("contains" after
// the server's normalisation: spaces, dots and dashes dropped, +84 read as 0). Unknown keys are refused (400).
export async function listParents(params, { signal } = {}) {
  const { data } = await api.get('/parents', { params: compact(params), signal });
  return data;
}

// UC-105 GET /parents/:parentId -> { parent: { parentId, userId, fullName, username, avatarUrl, phone, email,
// occupation, address, accountStatus, mustChangePassword, lockedUntil, createdAt }, children: [{ studentId,
// studentCode, fullName, avatarUrl, dob, gender, relationshipType, linkedAt, classId, className, gradeLevelName,
// trackName, schoolYearName, enrollmentStatus, homeroomTeacherName }] }. The class fields are null for a child with
// no class this year. 404 MSG_PARENT_NOT_FOUND for a missing id or an account without the PARENT role.
export async function getParent(parentId, { signal } = {}) {
  const { data } = await api.get(`/parents/${encodeURIComponent(parentId)}`, { signal });
  return data;
}

// UC-106 PATCH /parents/:parentId -> the updated "parent" object (same shape as UC-105's `parent`).
// changes may only hold fullName, occupation, address: the server rejects any other key with MSG_FIELD_NOT_EDITABLE
// (login identifiers belong to System Admin, UC-99) and an empty body with MSG_NO_FIELDS_TO_UPDATE.
// occupation / address null clears them; fullName cannot be cleared.
export async function updateParent(parentId, changes) {
  const { data } = await api.patch(`/parents/${encodeURIComponent(parentId)}`, changes);
  return data;
}
