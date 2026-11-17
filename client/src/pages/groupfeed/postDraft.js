// Draft of a NEW group post (SCR-36), kept in this browser's localStorage so a member who leaves the form (another
// screen, closed tab, lost connection) finds the text and the files already uploaded when coming back.
// One draft per account and group: key "educonnect:group-post-draft:<userId>:<groupId>". Nothing is sent to the
// server: the files of a draft are already in Storage (posts/…, confirmed by /uploads/confirm; the orphan clean-up only
// touches tmp/), and the server checks each of them again when the post is created.
// ASSUMPTION: a draft is kept 30 days, then dropped (business rules say nothing about drafts).

const PREFIX = 'educonnect:group-post-draft:';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const keyOf = (userId, groupId) => `${PREFIX}${userId}:${groupId}`;

// A file of the draft: what /uploads/confirm returned.
function isFile(f) {
  return (
    f && typeof f.storageKey === 'string' && typeof f.bucket === 'string' && typeof f.fileName === 'string' &&
    typeof f.mimeType === 'string' && Number.isFinite(f.sizeBytes)
  );
}

/** The saved draft { text, files, savedAt } or null (none, too old, unreadable, storage blocked). */
export function readDraft(userId, groupId) {
  if (!userId || !groupId) return null;
  try {
    const raw = window.localStorage.getItem(keyOf(userId, groupId));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    const files = Array.isArray(draft?.files) ? draft.files.filter(isFile) : [];
    const text = typeof draft?.text === 'string' ? draft.text : '';
    if (!Number.isFinite(draft?.savedAt) || Date.now() - draft.savedAt > MAX_AGE_MS || (!text.trim() && !files.length)) {
      clearDraft(userId, groupId);
      return null;
    }
    return { text, files, savedAt: draft.savedAt };
  } catch {
    return null;
  }
}

/** Saves the draft; an empty one (no text, no file) is removed instead. Returns savedAt, or null when nothing is kept. */
export function writeDraft(userId, groupId, { text, files }) {
  if (!userId || !groupId) return null;
  if (!text.trim() && !files.length) {
    clearDraft(userId, groupId);
    return null;
  }
  const savedAt = Date.now();
  try {
    window.localStorage.setItem(keyOf(userId, groupId), JSON.stringify({ text, files, savedAt }));
    return savedAt;
  } catch {
    return null; // storage full or blocked (private mode): the form still works, only without a draft
  }
}

export function clearDraft(userId, groupId) {
  try {
    window.localStorage.removeItem(keyOf(userId, groupId));
  } catch {
    // storage blocked: nothing was saved either
  }
}
