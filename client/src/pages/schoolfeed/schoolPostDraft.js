// Draft of a NEW school post (SCR-31, UC-60), kept in this browser's localStorage so a School Manager who leaves the
// form (another screen, closed tab, lost connection) finds the post as it was, files already uploaded included.
// Same approach as the FE-05 group post draft (pages/groupfeed/postDraft.js, Khanh), which cannot be used as it is:
// it keeps only { text, files } (anything else is dropped when read) and its key names a group. A school post also
// has a title, a type, an audience (grades / classes / roles) and the notification switch.
// One draft per account: key "educonnect:school-post-draft:<userId>". The school feed has no group, and only the School
// Manager creates school posts, so the account alone is enough; another account on the same browser never sees it.
// The draft stays in this browser: it does not follow the user to another device.
// Nothing is sent to the server: the files of a draft are already in Storage (confirmed by /uploads/confirm; the
// orphan clean-up only touches tmp/), and the server checks each of them again when the post is created.
// ASSUMPTION: a draft is kept 30 days, then dropped – the same number as the FE-05 group post draft, for consistency
// (business rules say nothing about drafts).
import { TARGETABLE_ROLES } from './schoolFeedShared.jsx';

const PREFIX = 'educonnect:school-post-draft:';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const POST_TYPES = ['ANNOUNCEMENT', 'NEWS'];

const keyOf = (userId) => `${PREFIX}${userId}`;

// A file of the draft: what /uploads/confirm returned.
function isFile(f) {
  return (
    f && typeof f.storageKey === 'string' && typeof f.bucket === 'string' && typeof f.fileName === 'string' &&
    typeof f.mimeType === 'string' && Number.isFinite(f.sizeBytes)
  );
}

const ids = (list) => (Array.isArray(list) ? list.filter((x) => Number.isInteger(x) && x > 0) : []);
const str = (value) => (typeof value === 'string' ? value : '');

// Worth keeping: something typed, a file, or a grade / class chosen (a type or a switch alone is not a draft).
const hasContent = (d) =>
  d.title.trim() !== '' || d.content.trim() !== '' || d.files.length > 0 ||
  d.audience.gradeLevelIds.length > 0 || d.audience.classIds.length > 0;

/**
 * The saved draft { postType, title, content, sendNotification, audience, targetRoles, files, savedAt } or null
 * (none, too old, unreadable, storage blocked). Values that do not fit the form are put back to safe ones.
 */
export function readSchoolDraft(userId) {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(keyOf(userId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    const draft = {
      postType: POST_TYPES.includes(d?.postType) ? d.postType : 'ANNOUNCEMENT',
      title: str(d?.title),
      content: str(d?.content),
      sendNotification: typeof d?.sendNotification === 'boolean' ? d.sendNotification : null,
      audience: { gradeLevelIds: ids(d?.audience?.gradeLevelIds), classIds: ids(d?.audience?.classIds) },
      targetRoles: Array.isArray(d?.targetRoles) ? TARGETABLE_ROLES.filter((r) => d.targetRoles.includes(r)) : null,
      files: Array.isArray(d?.files) ? d.files.filter(isFile) : [],
      savedAt: d?.savedAt,
    };
    if (!Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > MAX_AGE_MS || !hasContent(draft)) {
      clearSchoolDraft(userId);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** Saves the draft; one with nothing worth keeping is removed instead. Returns savedAt, or null when nothing is kept. */
export function writeSchoolDraft(userId, draft) {
  if (!userId) return null;
  if (!hasContent(draft)) {
    clearSchoolDraft(userId);
    return null;
  }
  const savedAt = Date.now();
  try {
    window.localStorage.setItem(keyOf(userId), JSON.stringify({ ...draft, savedAt }));
    return savedAt;
  } catch {
    return null; // storage full or blocked (private mode): the form still works, only without a draft
  }
}

export function clearSchoolDraft(userId) {
  try {
    window.localStorage.removeItem(keyOf(userId));
  } catch {
    // storage blocked: nothing was saved either
  }
}

// "10:32" today, "10:32, 11/11" another day (as the group post draft notice).
export function draftSavedTime(ms) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${time}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}
