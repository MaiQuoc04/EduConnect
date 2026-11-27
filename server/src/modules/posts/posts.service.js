import { pool, withTransaction } from '../../config/db.js';
import { AppError, forbidden, notFound } from '../../utils/AppError.js';
import * as files from '../../utils/attachments.js';
import * as feed from '../../utils/feedInteractions.js';
import * as reports from '../../utils/commentReports.js';
import { notifyContentHidden } from '../../utils/moderationNotify.js'; // moderation (FE-08 Anh, 25/11/2026)
import { moderateText, moderationTermsOf } from '../../utils/moderationRules.js'; // moderation (FE-08 Anh, 27/11/2026)
import { getNumberSetting } from '../../utils/settings.js';
import { emitToUsers } from '../../sockets/index.js';
import { activeMemberIds } from '../conversations/conversations.service.js';
import { findGroupForUser } from '../groups/groupAccess.js';
import { activitiesOfPosts, assertNotActivity } from '../extracurricular/extracurricular.service.js';
import { ATTACHMENT_TYPES } from '../uploads/uploads.service.js'; // the 15 types of the attachments bucket (read only)
// FE-09 (Quoc, 18/11/2026, lead): notifications of the group feed – new live post (members), post waiting for approval
// (moderator), approved / rejected (author). Written inside the same transaction, pushed on COMMIT.
import { notifyGroupPost, notifyPostPending, notifyPostReviewed } from '../notifications/groupPostNotifications.js';

// FE-05 Group Feed (owner: Khanh), UC-36..UC-46. Rules: business-rules §5 (post states agreed by the lead 11/11/2026),
// permissions.md "Group feed" rows (notes 4, 5, 6, 16).
//
// Who may open a feed is FE-04's findGroupForUser (active role + data scope); this module adds what is particular to
// the feed:
//   - only the class GENERAL group and the TEACHER_SCHOOL group have a feed; the School Manager never sees a class feed;
//   - moderator = the class's current homeroom teacher acting as TEACHER (GENERAL), the School Manager (TEACHER_SCHOOL);
//   - a post is "live" when APPROVED and not hidden: every member sees it and may like / comment. PENDING, REJECTED and
//     hidden posts are seen only by their author and the moderator (§5);
//   - last year's groups are read only (§4): every write → 409 MSG_GROUP_READ_ONLY.
// Likes and comment rows go through utils/feedInteractions.js, shared with FE-08 School Feed (column post_id).
// Attachments (12/11/2026): files go up through the shared modules/uploads (target 'post' → folder posts/), and their
// rows through utils/attachments.js (column post_id), as FE-08. Sizes from system_settings (§5: images / files
// upload.max_file_mb, videos upload.max_video_mb). A file is part of the post: who sees the post sees its files.

const POST = feed.FEED_COLUMNS.GROUP_POST;
const FEED_GROUP_TYPES = ['GENERAL', 'TEACHER_SCHOOL']; // business-rules §4: the other groups are chat only
export const MAX_PINNED = 3; // business-rules §5 (11/11/2026; 5 → 3 on 17/11/2026, agreed by Khanh and Anh for both feeds)
// ASSUMPTION: at most 10 files per post, as FE-08 school posts (§5 sets sizes, not a number).
export const MAX_ATTACHMENTS = 10;
const FILES = files.ATTACHMENT_COLUMNS.GROUP_POST;
const filesOf = (postId) => ({ column: FILES, id: postId });
export const VIEWS = ['feed', 'mine', 'pending', 'hidden'];
const MODERATOR_VIEWS = ['pending', 'hidden'];

const conflict = (code, message) => new AppError(409, code, message);
const postNotFound = () => notFound('MSG_POST_NOT_FOUND', 'The post was not found.');
const commentNotFound = () => notFound('MSG_COMMENT_NOT_FOUND', 'The comment was not found.');

function isModeratorOf(user, group) {
  if (group.groupType === 'GENERAL') return user.activeRole === 'TEACHER' && group.isHomeroom;
  return group.groupType === 'TEACHER_SCHOOL' && user.activeRole === 'SCHOOL_MANAGER';
}

// The group of a feed the user may read, with isModerator. Not a feed group / no right → 404 (existence not revealed).
async function openFeed(db, user, groupId) {
  const group = await findGroupForUser(db, user, groupId);
  if (!group.canSeeContent || !FEED_GROUP_TYPES.includes(group.groupType)) {
    throw notFound('MSG_FEED_NOT_FOUND', 'This group has no feed you can open.');
  }
  return { ...group, isModerator: isModeratorOf(user, group) };
}

function assertWritable(group) {
  if (group.readOnly) throw conflict('MSG_GROUP_READ_ONLY', 'The school year has ended; the group is read only.');
}

function assertModerator(group) {
  if (!group.isModerator) throw forbidden('FORBIDDEN', 'Only the moderator of the group can do this.');
}

const isLive = (post) => post.approvalStatus === 'APPROVED' && !post.isHidden;
// moderation (FE-08 Anh, 27/11/2026): a post the automatic check stopped when it was posted or edited ("Chưa đăng – vi
// phạm"). Seen by its author only (not by the moderator, not in any queue); the author edits or deletes it. Not a
// violation: nothing in moderation_violations, no statistics, no unhide (business-rules §5, §17).
const BLOCKED = 'BLOCKED';
const isBlocked = (post) => post.approvalStatus === BLOCKED;


// A post as the API returns it (alias p = posts). The nickname (UC-34) comes from the author's enrollment in the
// group's class, so it never shows in the teacher group (business-rules §4), as in the chat.
const POST_FIELDS = `p.post_id AS "postId", p.group_id AS "groupId", p.content,
       p.approval_status AS "approvalStatus", p.is_pinned AS "isPinned", p.is_hidden AS "isHidden",
       p.created_at AS "createdAt", p.updated_at AS "updatedAt", p.reviewed_at AS "reviewedAt",
       p.hidden_at AS "hiddenAt", p.author_id AS "authorId", u.full_name AS "authorName",
       u.avatar_url AS "authorAvatarUrl", u.status AS "authorStatus", e.nickname AS "authorNickname"`;
const POST_FROM = `FROM posts p
     JOIN groups g ON g.group_id = p.group_id
     JOIN users u ON u.user_id = p.author_id
     LEFT JOIN students st ON st.user_id = p.author_id
     LEFT JOIN class_enrollments e ON e.student_id = st.student_id AND e.class_id = g.class_id`;

// What the viewer may do with the post. The client shows buttons from these flags only; every action checks again.
function permissionsOf(post, user, group) {
  const open = !group.readOnly;
  const own = post.authorId === user.userId;
  const mod = group.isModerator;
  return {
    interact: open && isLive(post),
    // Report a comment (19/11/2026): whoever may interact, except the moderator, who deletes directly (as the School
    // Manager on the school feed).
    report: open && isLive(post) && !mod,
    edit: open && own, // a hidden post too: saving sends it back for approval (§5, 12/11/2026)
    delete: open && own,
    pin: open && mod && isLive(post),
    hide: open && mod && post.approvalStatus === 'APPROVED',
    review: open && mod && post.approvalStatus === 'PENDING',
  };
}

// Likes, comment counts and files (count + first image) of a page of posts: a few queries for the whole page (no N+1).
async function decorate(posts, user, group, db = pool) {
  const ids = posts.map((p) => p.postId);
  const [likes, comments, attachments, activities] = await Promise.all([
    feed.countLikes(POST, ids, user.userId, db),
    feed.countComments(POST, ids, db),
    files.summarizeAttachments(FILES, ids, db),
    activitiesOfPosts(ids, db), // FE-07 (Dung): a post that carries an extracurricular activity
  ]);
  // moderation (FE-08 Anh, 27/11/2026): the author of a BLOCKED post is told what to change, checked again now with the
  // rules in memory (no query, nothing stored). Nobody else ever gets a BLOCKED post.
  const blockedTerms = new Map();
  for (const post of posts) {
    if (isBlocked(post) && post.authorId === user.userId) blockedTerms.set(post.postId, await moderationTermsOf(post.content));
  }
  return posts.map((post) => {
    const activity = activities.get(String(post.postId)) ?? null;
    const can = permissionsOf(post, user, group);
    return {
      ...(blockedTerms.has(post.postId) ? { moderation: blockedTerms.get(post.postId) } : {}),
      ...post,
      likeCount: likes.get(post.postId)?.likeCount ?? 0,
      likedByMe: likes.get(post.postId)?.likedByMe ?? false,
      commentCount: comments.get(post.postId) ?? 0,
      attachmentCount: attachments.get(post.postId)?.attachmentCount ?? 0,
      firstImageUrl: attachments.get(post.postId)?.firstImageUrl ?? null, // signed for one hour
      activity,
      // FE-07: an activity's post is edited / cancelled through the activity screens (UC-51, UC-52), not here.
      can: activity ? { ...can, edit: false, delete: false } : can,
    };
  });
}

/**
 * The post if the user may see it (else 404), with its group. lock: 'share' for likes / comments (an edit or delete
 * of the same post waits until they are saved), 'update' for changes of the post itself.
 */
async function openPost(db, user, postId, { lock } = {}) {
  const lockSql = lock === 'update' ? 'FOR UPDATE OF p' : lock === 'share' ? 'FOR SHARE OF p' : '';
  const { rows } = await db.query(
    `SELECT ${POST_FIELDS} ${POST_FROM} WHERE p.post_id = $1 AND p.deleted_at IS NULL ${lockSql}`,
    [postId],
  );
  const post = rows[0];
  if (!post) throw postNotFound();
  let group;
  try {
    group = await openFeed(db, user, post.groupId);
  } catch (err) {
    if (err.status === 404) throw postNotFound();
    throw err;
  }
  if (!isLive(post) && post.authorId !== user.userId && !group.isModerator) throw postNotFound();
  if (isBlocked(post) && post.authorId !== user.userId) throw postNotFound(); // moderation (FE-08 Anh, 27/11/2026): author only
  return { post, group, target: { column: POST, id: post.postId } };
}

async function readPost(db, user, group, postId) {
  const { rows } = await db.query(`SELECT ${POST_FIELDS} ${POST_FROM} WHERE p.post_id = $1`, [postId]);
  return (await decorate(rows, user, group, db))[0];
}

// --- Real-time signals ----------------------------------------------------------------------------------------------
// Ids only, sent after COMMIT, through each member's "user:<id>" room (as FE-06; no per-post room needed: the readers
// of a group feed are its members). The client reloads through this API, which checks the active role again.
//   post:changed          { groupId, postId, change }   change: created | updated | deleted | pinned | unpinned |
//                                                        hidden | unhidden | approved | rejected
//   post:comment          { groupId, postId, commentId, parentCommentId, authorId }
//   post:comment-deleted  { groupId, postId, commentId }
//   feed:settings         { groupId, requireApproval }
// A change nobody else may see (a pending / rejected / hidden post) goes to the moderators and the author only.
// No event for likes (as FE-08): the client keeps its optimistic count.

async function moderatorIds(db, group) {
  const { rows } =
    group.groupType === 'GENERAL'
      ? await db.query(
          `SELECT t.user_id AS "userId" FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
           WHERE c.class_id = $1`,
          [group.classId],
        )
      : await db.query(
          `SELECT ur.user_id AS "userId" FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
           WHERE r.role_code = 'SCHOOL_MANAGER'`,
        );
  return rows.map((r) => r.userId);
}

function signal(group, event, payload, { everyone, authorId } = { everyone: true }) {
  const label = `${event} group #${group.groupId}`;
  (async () => {
    const userIds = everyone
      ? await activeMemberIds(pool, group.groupId)
      : [...(await moderatorIds(pool, group)), authorId];
    emitToUsers(userIds, event, { groupId: group.groupId, ...payload });
  })().catch((err) => console.error(`[posts] ${label} not sent:`, err?.message));
}

const postChanged = (group, post, change, wasLive) =>
  signal(
    group,
    'post:changed',
    { postId: post.postId, change },
    { everyone: wasLive || isLive(post), authorId: post.authorId },
  );

// --- UC-36 View Group Feed ------------------------------------------------------------------------------------------

/**
 * One page of the feed of a group. view:
 *   feed     live posts (APPROVED, not hidden): pinned first, then newest first – every member
 *   mine     the viewer's own posts that are not live (pending, rejected, hidden, blocked – moderation 27/11/2026), newest first
 *   pending  posts waiting for approval, first sent first (UC-46 queue; an edited post counts from when it was sent again) – moderator only
 *   hidden   hidden posts, last hidden first (unhide, §5) – moderator only
 * The group block tells the client what to show around the list: approval on, read only, moderator, the "no homeroom
 * teacher" banner (§5: a class whose homeroom teacher is missing or locked), and the counters of the tabs.
 */
export async function listPosts(user, groupId, { view, page, pageSize }) {
  const group = await openFeed(pool, user, groupId);
  if (MODERATOR_VIEWS.includes(view)) assertModerator(group);

  const params = [group.groupId];
  const $ = (value) => `$${params.push(value)}`;
  // Functions, so only the chosen view adds its parameters (PostgreSQL refuses a parameter the SQL never uses).
  const views = {
    feed: () => ({
      where: `p.approval_status = 'APPROVED' AND NOT p.is_hidden`,
      order: 'p.is_pinned DESC, p.created_at DESC',
    }),
    mine: () => ({
      where: `p.author_id = ${$(user.userId)} AND (p.approval_status <> 'APPROVED' OR p.is_hidden)`,
      order: 'p.created_at DESC',
    }),
    // First sent, first shown: the time the post entered the queue – created, or edited and sent again (an approved,
    // rejected or hidden post edited goes back to PENDING; only an author's edit sets updated_at).
    pending: () => ({
      where: `p.approval_status = 'PENDING'`,
      order: 'COALESCE(p.updated_at, p.created_at) ASC, p.post_id ASC',
    }),
    // moderation (FE-08 Anh, 27/11/2026): a hidden post its author edited into BLOCKED keeps is_hidden, but leaves this
    // queue (the author alone sees it, under "mine").
    hidden: () => ({ where: `p.is_hidden AND p.approval_status <> 'BLOCKED'`, order: 'p.hidden_at DESC' }),
  };
  const { where, order } = views[view]();
  const filter = `WHERE p.group_id = $1 AND p.deleted_at IS NULL AND ${where}`;
  const filterParams = [...params];
  const { rows } = await pool.query(
    `SELECT ${POST_FIELDS}, COUNT(*) OVER () AS total
     ${POST_FROM}
     ${filter}
     ORDER BY ${order}, p.post_id DESC
     LIMIT ${$(pageSize)} OFFSET ${$((page - 1) * pageSize)}`,
    params,
  );
  // COUNT(*) OVER () is the total of every page; only a page past the end needs its own count.
  const total = rows.length
    ? rows[0].total
    : page > 1
      ? (await pool.query(`SELECT COUNT(*) AS n FROM posts p ${filter}`, filterParams)).rows[0].n
      : 0;

  // Tab counters and the homeroom banner in one query.
  const { rows: summary } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE p.approval_status = 'PENDING') AS "pendingCount",
            COUNT(*) FILTER (WHERE p.is_hidden AND p.approval_status <> 'BLOCKED') AS "hiddenCount", -- moderation (FE-08 Anh, 27/11/2026)
            COUNT(*) FILTER (WHERE p.author_id = $2 AND (p.approval_status <> 'APPROVED' OR p.is_hidden)) AS "mineCount",
            COUNT(*) FILTER (WHERE p.is_pinned AND p.approval_status = 'APPROVED' AND NOT p.is_hidden) AS "pinnedCount",
            ($3::bigint IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
               JOIN users hu ON hu.user_id = t.user_id
               WHERE c.class_id = $3::bigint AND hu.status = 'ACTIVE')) AS "moderatorMissing"
     FROM (SELECT 1) one
     LEFT JOIN posts p ON p.group_id = $1 AND p.deleted_at IS NULL`,
    [group.groupId, user.userId, group.groupType === 'GENERAL' ? group.classId : null],
  );
  const s = summary[0];

  return {
    group: {
      groupId: group.groupId,
      groupType: group.groupType,
      requireApproval: group.requireApproval,
      readOnly: group.readOnly,
      isModerator: group.isModerator,
      moderatorMissing: s.moderatorMissing,
      canPost: !group.readOnly,
      maxPinned: MAX_PINNED,
    },
    counts: {
      mine: s.mineCount,
      pinned: s.pinnedCount,
      ...(group.isModerator ? { pending: s.pendingCount, hidden: s.hiddenCount } : {}),
    },
    items: await decorate(
      rows.map(({ total: _total, ...post }) => post),
      user,
      group,
    ),
    page,
    pageSize,
    total,
  };
}

// --- UC-37 View Post Detail -----------------------------------------------------------------------------------------

export async function getPost(user, postId) {
  const { post, group } = await openPost(pool, user, postId);
  const [[item], attachments] = await Promise.all([
    decorate([post], user, group),
    files.listAttachments(filesOf(post.postId)), // every file, links signed for one hour
  ]);
  return {
    ...item,
    attachments,
    group: {
      groupId: group.groupId,
      groupType: group.groupType,
      groupName: group.groupName,
      readOnly: group.readOnly,
      isModerator: group.isModerator,
    },
  };
}

/**
 * What a file picker must respect, read from system_settings at each call (never hard-coded): SCR-36 / SCR-38, and
 * the FE-06 chat composer with its own maxFiles.
 */
export async function getAttachmentLimits(maxFiles = MAX_ATTACHMENTS) {
  return {
    maxFiles,
    maxFileMb: await getNumberSetting('upload.max_file_mb', 10),
    maxVideoMb: await getNumberSetting('upload.max_video_mb', 50),
    types: Object.entries(ATTACHMENT_TYPES).map(([mimeType, rule]) => ({ mimeType, kind: rule.kind, extensions: rule.ext })),
  };
}

// --- UC-38 Create Post ----------------------------------------------------------------------------------------------

/**
 * Any member of a feed group can post (§5). Approved at once when the author is the moderator (homeroom teacher in
 * the class, School Manager in the teacher group) or the group has approval off; otherwise PENDING.
 * attachments: /uploads/confirm answers (controller: at most MAX_ATTACHMENTS, keys in posts/). The objects are checked
 * before the transaction; the rows are written with the post, in the order sent, or not at all.
 */
export async function createPost(user, groupId, { content, attachments = [] }) {
  const fileRows = await files.readUploadedFiles(attachments);
  // moderation (FE-08 Anh, 27/11/2026): the text is checked before the transaction (in memory, never waits for the
  // database, never throws). Only content, never the files. Not applied to the moderator's own post.
  const check = await moderateText(content);
  const { group, post } = await withTransaction(async (client) => {
    const g = await openFeed(client, user, groupId);
    assertWritable(g);
    const blocked = check.hidden && !g.isModerator; // moderation (FE-08 Anh, 27/11/2026)
    const status = blocked ? BLOCKED : g.isModerator || !g.requireApproval ? 'APPROVED' : 'PENDING';
    const { rows } = await client.query(
      `INSERT INTO posts (group_id, author_id, content, approval_status, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING post_id AS "postId"`,
      [g.groupId, user.userId, content, status],
    );
    await files.insertAttachments(filesOf(rows[0].postId), fileRows.map((r) => ({ ...r, uploadedBy: user.userId })), client);
    // FE-09 (lead 18/11/2026): a live post notifies the other members (bell); a pending one tells the moderator.
    // moderation (FE-08 Anh, 27/11/2026): a BLOCKED post tells nobody (not even its author: they see it on screen).
    if (status === 'APPROVED') await notifyGroupPost(client, { postId: rows[0].postId });
    else if (status === 'PENDING') await notifyPostPending(client, { postId: rows[0].postId });
    return { group: g, post: await readPost(client, user, g, rows[0].postId) };
  });
  // moderation (FE-08 Anh, 27/11/2026): a BLOCKED post is signalled to its author only (their other tabs).
  if (isBlocked(post)) emitToUsers([post.authorId], 'post:changed', { groupId: group.groupId, postId: post.postId, change: 'created' });
  else postChanged(group, post, 'created', false);
  return post;
}

// --- UC-39 Edit Own Post --------------------------------------------------------------------------------------------

/**
 * The author edits the text (§5, 11/11/2026).
 * New state: APPROVED when the author is the moderator or approval is off, else PENDING – so an approved post edited
 * while approval is on leaves the feed until it is approved again, and a rejected post is sent for approval again.
 * A HIDDEN post (§5, agreed by the lead 12/11/2026) can be edited too: saving unhides it and sends it to PENDING even
 * when approval is off, so only the moderator can bring it back to the feed (the moderator's own post: APPROVED).
 * Leaving the feed also unpins it. Same text and no file added / removed → nothing is written (a hidden post stays
 * hidden).
 * Files: attachments (new, as UC-38) are added, removeAttachmentIds (files of this post) are soft deleted; a change of
 * files counts as an edit (same new state as a text change).
 */
export async function updatePost(user, postId, { content, attachments = [], removeAttachmentIds = [] }) {
  const addRows = await files.readUploadedFiles(attachments); // storage is read before the lock
  // moderation (FE-08 Anh, 27/11/2026): the new text is checked before the transaction, as in createPost.
  const check = await moderateText(content);
  const result = await withTransaction(async (client) => {
    const { post, group } = await openPost(client, user, postId, { lock: 'update' });
    assertWritable(group);
    if (post.authorId !== user.userId) throw forbidden('FORBIDDEN', 'You can only edit your own posts.');
    await assertNotActivity(client, post.postId); // FE-07: 409 MSG_POST_IS_ACTIVITY
    const filesChanged = await files.changeAttachments(
      filesOf(post.postId),
      { add: addRows, removeIds: removeAttachmentIds, uploadedBy: user.userId, max: MAX_ATTACHMENTS },
      client,
    );
    // moderation (FE-08 Anh, 27/11/2026): new text that breaks a rule → BLOCKED (leaves the feed / queue, unpinned; the
    // hidden mark is kept, so a hidden post edited clean later still goes to the moderator). A BLOCKED post edited clean
    // is "released" with the usual state below and counts as a NEW post: posted now, no "edited" mark.
    // ASSUMPTION: every saved edit is checked (also a change of files only), so a BLOCKED post is never released with
    // its old text unchecked.
    const blocked = check.hidden && !group.isModerator;
    // moderation (FE-08 Anh, 27/11/2026): a BLOCKED post saved unchanged is checked again (the rules may have changed):
    // clean → released below; still breaking a rule → stays BLOCKED, nothing written.
    if (post.content === content && !filesChanged && (!isBlocked(post) || blocked)) {
      return { group, before: post, changed: false, post: (await decorate([post], user, group, client))[0] };
    }
    const released = isBlocked(post) && !blocked;
    const status = blocked
      ? BLOCKED
      : group.isModerator || (!group.requireApproval && !post.isHidden) ? 'APPROVED' : 'PENDING';
    await client.query(
      `UPDATE posts
       SET content = $2, approval_status = $3::varchar,
           updated_at = CASE WHEN $4::boolean THEN NULL ELSE NOW() END,
           created_at = CASE WHEN $4::boolean THEN NOW() ELSE created_at END,
           reviewed_by = CASE WHEN approval_status = $3::varchar THEN reviewed_by END,
           reviewed_at = CASE WHEN approval_status = $3::varchar THEN reviewed_at END,
           is_pinned = is_pinned AND $3::varchar = 'APPROVED',
           is_hidden = CASE WHEN $3::varchar = 'BLOCKED' THEN is_hidden ELSE FALSE END,
           hidden_by = CASE WHEN $3::varchar = 'BLOCKED' THEN hidden_by END,
           hidden_at = CASE WHEN $3::varchar = 'BLOCKED' THEN hidden_at END
       WHERE post_id = $1`,
      [post.postId, content, status, released],
    );
    // FE-09 (lead 18/11/2026): back to waiting → tell the moderator; a post that was not on the feed and now is
    // (approval off, or the moderator's own post) → tell the members, as a new post.
    if (status === 'PENDING' && post.approvalStatus !== 'PENDING') await notifyPostPending(client, { postId: post.postId });
    // BLOCKED: neither (moderation, FE-08 Anh, 27/11/2026); released: one of them, as a new post.
    if (status === 'APPROVED' && !isLive(post)) await notifyGroupPost(client, { postId: post.postId });
    return { group, before: post, changed: true, post: await readPost(client, user, group, post.postId) };
  });
  if (!result.changed) return result.post;
  // moderation (FE-08 Anh, 27/11/2026): ids only, as before. BLOCKED → BLOCKED concerns the author alone; a post that
  // leaves the feed / queue for BLOCKED goes the usual way ("updated", the readers reload and it is gone); a released
  // post is "created".
  if (isBlocked(result.before) && isBlocked(result.post)) {
    emitToUsers([result.post.authorId], 'post:changed', { groupId: result.group.groupId, postId: result.post.postId, change: 'updated' });
  } else {
    postChanged(result.group, result.post, isBlocked(result.before) ? 'created' : 'updated', isLive(result.before));
  }
  return result.post;
}

// --- UC-40 Delete Own Post ------------------------------------------------------------------------------------------

// Soft delete by the author, whatever its state (§14). Its comments and likes stay in the DB, unreachable; its files
// are soft deleted with it (the objects stay in the bucket, no link is signed for them any more).
export async function deletePost(user, postId) {
  const { group, post } = await withTransaction(async (client) => {
    const opened = await openPost(client, user, postId, { lock: 'update' });
    assertWritable(opened.group);
    if (opened.post.authorId !== user.userId) throw forbidden('FORBIDDEN', 'You can only delete your own posts.');
    await assertNotActivity(client, opened.post.postId); // FE-07: cancel the activity instead (UC-52)
    await client.query(`UPDATE posts SET deleted_at = NOW(), deleted_by = $2 WHERE post_id = $1`, [
      opened.post.postId,
      user.userId,
    ]);
    await files.softDeleteAttachments(filesOf(opened.post.postId), client);
    return opened;
  });
  signal(
    group,
    'post:changed',
    { postId: post.postId, change: 'deleted' },
    { everyone: isLive(post), authorId: post.authorId },
  );
  return { postId: post.postId, isDeleted: true };
}

// --- UC-43 React to Post --------------------------------------------------------------------------------------------

function assertLive(post) {
  if (!isLive(post)) {
    throw conflict('MSG_POST_NOT_INTERACTIVE', 'Only approved posts that are not hidden can be liked or commented on.');
  }
}

// Like (true) / unlike (false), both idempotent (PUT / DELETE, as FE-08). Unlike hard deletes the row (§14).
export async function setLike(user, postId, liked) {
  return withTransaction(async (client) => {
    const { post, group, target } = await openPost(client, user, postId, { lock: 'share' });
    assertWritable(group);
    assertLive(post);
    if (liked) await feed.addLike(target, user.userId, client);
    else await feed.removeLike(target, user.userId, client);
    return feed.likeSummary(target, user.userId, client);
  });
}

// --- UC-41 Comment on Post, UC-42 / UC-45 Delete Comment ------------------------------------------------------------

// permissions.md note 16 / §5: the comment's author, the post's author, or the group moderator; never in a read-only
// group.
const mayDeleteComment = (user, post, group) => (comment) =>
  !group.readOnly && (comment.authorId === user.userId || post.authorId === user.userId || group.isModerator);

const commentCountOf = async (postId, db = pool) => (await feed.countComments(POST, [postId], db)).get(postId) ?? 0;

// The comment tree of a post anyone allowed to see it can read (also a hidden one: author and moderator).
export async function listComments(user, postId, { page, pageSize }) {
  const { post, group, target } = await openPost(pool, user, postId);
  const result = await feed.listComments(target, { page, pageSize, canDelete: mayDeleteComment(user, post, group),
    viewerId: user.userId }); // moderation (25/11/2026): the reader's own hidden comments come back with isHidden
  // 19/11/2026 (as FE-08): each comment's likes (likeCount, likedByMe) and whether the reader reported it; canReport
  // false on the comments of the group's moderator (their reports would land in their own queue, §5).
  const liked = await reports.withReportedByMe(await feed.withCommentLikes(result.items, user.userId), user.userId);
  const moderators = new Set(await moderatorIds(pool, group));
  const markReportable = (list) =>
    list.map((n) => ({ ...n, canReport: !moderators.has(n.authorId), replies: markReportable(n.replies) }));
  return { ...result, items: markReportable(liked), commentCount: await commentCountOf(post.postId) };
}

// ASSUMPTION: only live posts can be commented on or liked (a pending, rejected or hidden post is not in the feed).
export async function createComment(user, postId, { content, parentCommentId }) {
  const { group, comment, post } = await withTransaction(async (client) => {
    const opened = await openPost(client, user, postId, { lock: 'share' });
    assertWritable(opened.group);
    assertLive(opened.post);
    const row = await feed.insertComment(opened.target, { authorId: user.userId, content, parentCommentId }, client);
    return { ...opened, comment: { ...row, canDelete: !row.isHidden } };
  });
  // Moderation (FE-08 Anh, 25/11/2026): a hidden comment is seen by its author only – tell them, send no signal.
  if (comment.moderation?.hidden) {
    notifyContentHidden({ contentType: 'GROUP_COMMENT', authorId: comment.authorId, postTarget: { column: 'post_id', id: post.postId }, category: comment.moderation.category })
      .catch((err) => console.error(`[posts] moderation notification for comment #${comment.commentId} not sent:`, err?.message));
    return comment;
  }
  signal(group, 'post:comment', {
    postId: post.postId,
    commentId: comment.commentId,
    parentCommentId: comment.parentCommentId,
    authorId: comment.authorId,
  });
  return comment;
}

export async function deleteComment(user, postId, commentId) {
  const { group, post, result } = await withTransaction(async (client) => {
    const opened = await openPost(client, user, postId, { lock: 'share' });
    assertWritable(opened.group);
    const comment = await feed.findComment(opened.target, commentId, { forUpdate: true }, client);
    if (!comment || comment.isDeleted) throw commentNotFound();
    if (!mayDeleteComment(user, opened.post, opened.group)(comment)) {
      throw forbidden('FORBIDDEN', 'You cannot delete this comment.');
    }
    await feed.softDeleteComment(opened.target, commentId, user.userId, client);
    // 19/11/2026: a comment gone has nothing left to decide – its pending reports are closed (RESOLVED, by whoever
    // deleted it), so the moderator's queue never keeps them (as FE-08).
    await reports.resolvePendingReports(commentId, user.userId, client);
    return {
      ...opened,
      result: { commentId, isDeleted: true, commentCount: await commentCountOf(opened.post.postId, client) },
    };
  });
  signal(
    group,
    'post:comment-deleted',
    { postId: post.postId, commentId },
    { everyone: isLive(post), authorId: post.authorId },
  );
  return result;
}

// --- Comment likes and reports (19/11/2026, as FE-08; data layer utils/feedInteractions.js / commentReports.js) ------

// The comment of this post the user acts on: a live post of a writable group (as liking the post), the comment not
// deleted (else 404 MSG_COMMENT_NOT_FOUND).
async function openCommentOfPost(client, user, postId, commentId) {
  const opened = await openPost(client, user, postId, { lock: 'share' });
  assertWritable(opened.group);
  assertLive(opened.post);
  const comment = await feed.findComment(opened.target, commentId, { forShare: true }, client);
  if (!comment || comment.isDeleted) throw commentNotFound();
  return { ...opened, comment };
}

/** Like (true) / unlike (false) a comment, idempotent. No socket event (as post likes and FE-08). */
export async function setCommentLike(user, postId, commentId, liked) {
  return withTransaction(async (client) => {
    const { comment } = await openCommentOfPost(client, user, postId, commentId);
    const target = { column: feed.FEED_COLUMNS.COMMENT, id: comment.commentId };
    if (liked) await feed.addLike(target, user.userId, client);
    else await feed.removeLike(target, user.userId, client);
    return { commentId: comment.commentId, ...(await feed.likeSummary(target, user.userId, client)) };
  });
}

/**
 * Report a comment (body checked by the controller, reports.parseReportInput). Any member who may interact with the
 * post, except its group's moderator (403: they delete comments directly). Own comment → 400; reporting again → 200
 * { created: false }, nothing changes (reports.reportComment).
 */
export async function reportComment(user, postId, commentId, input) {
  return withTransaction(async (client) => {
    const { comment, group } = await openCommentOfPost(client, user, postId, commentId);
    if (group.isModerator) {
      throw forbidden('MSG_MODERATOR_CANNOT_REPORT', 'The moderator deletes comments directly instead of reporting them.');
    }
    // Option A (Khanh 19/11/2026, business-rules §5): the moderator's own comment cannot be reported – the report would
    // be judged by the person it is about. A complaint about them goes to the school directly.
    if ((await moderatorIds(client, group)).includes(comment.authorId)) {
      throw forbidden('MSG_CANNOT_REPORT_MODERATOR', "The group moderator's comments cannot be reported here.");
    }
    const report = await reports.reportComment(comment.commentId, user.userId, input, client);
    return { commentId: comment.commentId, reportedByMe: true, created: report.created };
  });
}

// The feeds whose comment reports the user handles (19/11/2026): a teacher, the GENERAL groups of the classes they
// are homeroom teacher of; the School Manager, the school's teacher group. Open school years only (a read-only group
// cannot be changed). Same moderator rule as isModeratorOf.
async function moderatedFeedIds(db, user) {
  if (user.activeRole === 'TEACHER') {
    const { rows } = await db.query(
      `SELECT g.group_id AS "groupId"
       FROM groups g
       JOIN classes c ON c.class_id = g.class_id AND c.deleted_at IS NULL
       JOIN school_years sy ON sy.school_year_id = c.school_year_id AND CURRENT_DATE <= sy.end_date
       JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
       WHERE g.group_type = 'GENERAL' AND g.deleted_at IS NULL AND t.user_id = $1`,
      [user.userId],
    );
    return rows.map((r) => r.groupId);
  }
  if (user.activeRole === 'SCHOOL_MANAGER') {
    const { rows } = await db.query(
      `SELECT group_id AS "groupId" FROM groups WHERE group_type = 'TEACHER_SCHOOL' AND deleted_at IS NULL`,
    );
    return rows.map((r) => r.groupId);
  }
  return [];
}

/**
 * GET /group-comment-reports (19/11/2026): one page of the reported comments of the feeds the user moderates
 * (reports.listReports with source GROUP_POST and only their group ids), plus pendingCount and moderates (false: the
 * user moderates no feed, the page says so). Never a school post comment (that queue is FE-08's /comment-reports).
 */
export async function listGroupCommentReports(user, { status, page, pageSize }) {
  const groupIds = await moderatedFeedIds(pool, user);
  const filter = { source: reports.REPORT_SOURCES.GROUP_POST, groupIds };
  const result = await reports.listReports({ ...filter, status, page, pageSize });
  return { ...result, pendingCount: await reports.countPendingReports(filter), moderates: groupIds.length > 0 };
}

/**
 * PATCH /group-comment-reports/:commentId { action }: DELETE the comment (soft; its pending reports → RESOLVED) or
 * DISMISS the reports (→ DISMISSED, the comment stays). A comment of a feed the user does not moderate, of a school
 * post, or without a report → 404 MSG_REPORT_NOT_FOUND (nothing is revealed). After COMMIT, DELETE only: the author's
 * notification naming nobody (reports.notifyCommentRemoved) and "post:comment-deleted" so open threads update.
 */
export async function resolveGroupCommentReport(user, commentId, action, { supportNote } = {}) {
  const result = await withTransaction(async (client) => {
    const comment = await reports.findReportedComment(commentId, { forUpdate: true }, client);
    const groupIds = await moderatedFeedIds(client, user);
    if (!comment || comment.column !== POST || !groupIds.includes(comment.groupId)) {
      throw notFound('MSG_REPORT_NOT_FOUND', 'No report was found for this comment.');
    }
    return { ...(await reports.resolveReport(commentId, user.userId, action, client, { supportNote })), groupId: comment.groupId };
  });
  if (result.commentDeleted) {
    reports
      .notifyCommentRemoved(result, user.userId)
      .catch((err) => console.error(`[posts] comment-removed notification #${commentId} not sent:`, err?.message));
    signal({ groupId: result.groupId }, 'post:comment-deleted', { postId: result.target.id, commentId });
  }
  const { commentDeleted, resolvedCount, status } = result;
  return { commentId, status, resolvedCount, commentDeleted };
}

// --- UC-44 Pin / Unpin, UC-45 Hide / Unhide, UC-46 Approve / Reject (moderator) -------------------------------------

// One moderator action on a locked post. change(client, post, group) writes and returns true, or returns false when
// the post is already in the wanted state (idempotent: 200, nothing written, no signal).
async function moderate(user, postId, changeName, change) {
  const { group, before, post, changed } = await withTransaction(async (client) => {
    const opened = await openPost(client, user, postId, { lock: 'update' });
    assertWritable(opened.group);
    assertModerator(opened.group);
    // moderation (FE-08 Anh, 27/11/2026): a BLOCKED post is not the moderator's to act on (review, pin, hide) – as if it
    // did not exist, also in the odd case where the moderator wrote it before they moderated the group.
    if (isBlocked(opened.post)) throw postNotFound();
    const wrote = await change(client, opened.post, opened.group);
    const after = wrote
      ? await readPost(client, user, opened.group, opened.post.postId)
      : (await decorate([opened.post], user, opened.group, client))[0];
    return { group: opened.group, before: opened.post, post: after, changed: wrote };
  });
  if (changed) postChanged(group, post, changeName, isLive(before));
  return post;
}

/**
 * UC-44: pin only a live post; at most MAX_PINNED pinned posts per group (§5) → 409 MSG_PIN_LIMIT. The group row is
 * locked while counting, so two moderators pinning at once cannot pass the limit together.
 */
export function setPinned(user, postId, isPinned) {
  return moderate(user, postId, isPinned ? 'pinned' : 'unpinned', async (client, post, group) => {
    if (post.isPinned === isPinned) return false;
    if (isPinned) {
      assertLive(post);
      await client.query(`SELECT 1 FROM groups WHERE group_id = $1 FOR UPDATE`, [group.groupId]);
      const { rows } = await client.query(
        `SELECT COUNT(*) AS n FROM posts
         WHERE group_id = $1 AND is_pinned AND deleted_at IS NULL AND approval_status = 'APPROVED' AND NOT is_hidden`,
        [group.groupId],
      );
      if (rows[0].n >= MAX_PINNED) {
        throw new AppError(409, 'MSG_PIN_LIMIT', `At most ${MAX_PINNED} pinned posts per group.`, { max: MAX_PINNED });
      }
    }
    await client.query(`UPDATE posts SET is_pinned = $2 WHERE post_id = $1`, [post.postId, isPinned]);
    return true;
  });
}

/**
 * UC-45: hide / unhide an approved post (a pending one is rejected instead → 409 MSG_POST_NOT_APPROVED). Hiding
 * unpins it; unhiding brings it back as a normal post, not pinned (§5).
 */
export function setHidden(user, postId, isHidden) {
  return moderate(user, postId, isHidden ? 'hidden' : 'unhidden', async (client, post) => {
    if (post.approvalStatus !== 'APPROVED') {
      throw conflict('MSG_POST_NOT_APPROVED', 'Only approved posts can be hidden.');
    }
    if (post.isHidden === isHidden) return false;
    if (isHidden) {
      await client.query(
        `UPDATE posts SET is_hidden = TRUE, hidden_by = $2, hidden_at = NOW(), is_pinned = FALSE WHERE post_id = $1`,
        [post.postId, user.userId],
      );
    } else {
      await client.query(`UPDATE posts SET is_hidden = FALSE, hidden_by = NULL, hidden_at = NULL WHERE post_id = $1`, [
        post.postId,
      ]);
    }
    return true;
  });
}

/**
 * UC-46: approve or reject a PENDING post (else 409 MSG_POST_NOT_PENDING). No reason is stored (§5).
 * A post that was edited and sent again (hidden, rejected, or approved then edited while approval is on; updated_at
 * set) and is now approved counts as a NEW post (Khanh's decision 12/11/2026, business-rules §5): its posting time
 * becomes now and the "edited" mark is cleared, so it shows at the top of the feed with today's time. Likes and
 * comments stay. A first approval keeps the time it was written.
 */
export function reviewPost(user, postId, decision) {
  const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  return moderate(user, postId, decision === 'APPROVE' ? 'approved' : 'rejected', async (client, post) => {
    if (post.approvalStatus !== 'PENDING') throw conflict('MSG_POST_NOT_PENDING', 'The post is not waiting for approval.');
    const repost = status === 'APPROVED' && post.updatedAt !== null;
    await client.query(
      `UPDATE posts SET approval_status = $2, reviewed_by = $3, reviewed_at = NOW(),
              created_at = CASE WHEN $4::boolean THEN NOW() ELSE created_at END,
              updated_at = CASE WHEN $4::boolean THEN NULL ELSE updated_at END
       WHERE post_id = $1`,
      [post.postId, status, user.userId, repost],
    );
    // FE-09 (lead 18/11/2026): the author learns the decision; an approved post now reaches the members (not the author).
    await notifyPostReviewed(client, { postId: post.postId, approved: status === 'APPROVED', reviewerId: user.userId });
    if (status === 'APPROVED') await notifyGroupPost(client, { postId: post.postId });
    return true;
  });
}

// --- Approval switch (§5, 11/11/2026) -------------------------------------------------------------------------------

/**
 * Turns post approval on / off for a feed group: the homeroom teacher for the class group, the School Manager for
 * the teacher group (the School Manager still never sees class feeds).
 * ASSUMPTION: turning approval off does not approve the posts already waiting; the moderator still reviews them.
 */
export async function setRequireApproval(user, groupId, requireApproval) {
  const group = await openFeed(pool, user, groupId);
  assertWritable(group);
  assertModerator(group);
  if (group.requireApproval !== requireApproval) {
    await pool.query(`UPDATE groups SET require_approval = $2 WHERE group_id = $1`, [group.groupId, requireApproval]);
    signal(group, 'feed:settings', { requireApproval });
  }
  return { groupId: group.groupId, requireApproval };
}
