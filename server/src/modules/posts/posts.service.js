import { pool, withTransaction } from '../../config/db.js';
import { AppError, forbidden, notFound } from '../../utils/AppError.js';
import * as feed from '../../utils/feedInteractions.js';
import { emitToUsers } from '../../sockets/index.js';
import { activeMemberIds } from '../conversations/conversations.service.js';
import { findGroupForUser } from '../groups/groupAccess.js';

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
// Attachments are not built yet (business-rules §15: storage provider not decided; same for FE-06 and FE-08).

const POST = feed.FEED_COLUMNS.GROUP_POST;
const FEED_GROUP_TYPES = ['GENERAL', 'TEACHER_SCHOOL']; // business-rules §4: the other groups are chat only
export const MAX_PINNED = 5; // business-rules §5 (11/11/2026)
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
    edit: open && own && !post.isHidden,
    delete: open && own,
    pin: open && mod && isLive(post),
    hide: open && mod && post.approvalStatus === 'APPROVED',
    review: open && mod && post.approvalStatus === 'PENDING',
  };
}

// Likes and comment counts of a page of posts: 2 queries for the whole page (no N+1).
async function decorate(posts, user, group, db = pool) {
  const ids = posts.map((p) => p.postId);
  const [likes, comments] = await Promise.all([
    feed.countLikes(POST, ids, user.userId, db),
    feed.countComments(POST, ids, db),
  ]);
  return posts.map((post) => ({
    ...post,
    likeCount: likes.get(post.postId)?.likeCount ?? 0,
    likedByMe: likes.get(post.postId)?.likedByMe ?? false,
    commentCount: comments.get(post.postId) ?? 0,
    can: permissionsOf(post, user, group),
  }));
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
 *   mine     the viewer's own posts that are not live (pending, rejected, hidden), newest first
 *   pending  posts waiting for approval, oldest first (UC-46 queue) – moderator only
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
    pending: () => ({ where: `p.approval_status = 'PENDING'`, order: 'p.created_at ASC' }),
    hidden: () => ({ where: `p.is_hidden`, order: 'p.hidden_at DESC' }),
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
            COUNT(*) FILTER (WHERE p.is_hidden) AS "hiddenCount",
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
  const [item] = await decorate([post], user, group);
  return {
    ...item,
    group: {
      groupId: group.groupId,
      groupType: group.groupType,
      groupName: group.groupName,
      readOnly: group.readOnly,
      isModerator: group.isModerator,
    },
  };
}

// --- UC-38 Create Post ----------------------------------------------------------------------------------------------

/**
 * Any member of a feed group can post (§5). Approved at once when the author is the moderator (homeroom teacher in
 * the class, School Manager in the teacher group) or the group has approval off; otherwise PENDING.
 */
export async function createPost(user, groupId, { content }) {
  const { group, post } = await withTransaction(async (client) => {
    const g = await openFeed(client, user, groupId);
    assertWritable(g);
    const status = g.isModerator || !g.requireApproval ? 'APPROVED' : 'PENDING';
    const { rows } = await client.query(
      `INSERT INTO posts (group_id, author_id, content, approval_status, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING post_id AS "postId"`,
      [g.groupId, user.userId, content, status],
    );
    return { group: g, post: await readPost(client, user, g, rows[0].postId) };
  });
  postChanged(group, post, 'created', false);
  return post;
}

// --- UC-39 Edit Own Post --------------------------------------------------------------------------------------------

/**
 * The author edits the text (§5, 11/11/2026). A hidden post cannot be edited (409 MSG_POST_HIDDEN).
 * New state: APPROVED when the author is the moderator or approval is off, else PENDING – so an approved post edited
 * while approval is on leaves the feed until it is approved again, and a rejected post is sent for approval again.
 * Leaving the feed also unpins it. Same text as before → nothing is written.
 */
export async function updatePost(user, postId, { content }) {
  const result = await withTransaction(async (client) => {
    const { post, group } = await openPost(client, user, postId, { lock: 'update' });
    assertWritable(group);
    if (post.authorId !== user.userId) throw forbidden('FORBIDDEN', 'You can only edit your own posts.');
    if (post.isHidden) throw conflict('MSG_POST_HIDDEN', 'A hidden post cannot be edited.');
    if (post.content === content) {
      return { group, before: post, changed: false, post: (await decorate([post], user, group, client))[0] };
    }
    const status = group.isModerator || !group.requireApproval ? 'APPROVED' : 'PENDING';
    await client.query(
      `UPDATE posts
       SET content = $2, updated_at = NOW(), approval_status = $3::varchar,
           reviewed_by = CASE WHEN approval_status = $3::varchar THEN reviewed_by END,
           reviewed_at = CASE WHEN approval_status = $3::varchar THEN reviewed_at END,
           is_pinned = is_pinned AND $3::varchar = 'APPROVED'
       WHERE post_id = $1`,
      [post.postId, content, status],
    );
    return { group, before: post, changed: true, post: await readPost(client, user, group, post.postId) };
  });
  if (result.changed) postChanged(result.group, result.post, 'updated', isLive(result.before));
  return result.post;
}

// --- UC-40 Delete Own Post ------------------------------------------------------------------------------------------

// Soft delete by the author, whatever its state (§14). Its comments and likes stay in the DB, unreachable.
export async function deletePost(user, postId) {
  const { group, post } = await withTransaction(async (client) => {
    const opened = await openPost(client, user, postId, { lock: 'update' });
    assertWritable(opened.group);
    if (opened.post.authorId !== user.userId) throw forbidden('FORBIDDEN', 'You can only delete your own posts.');
    await client.query(`UPDATE posts SET deleted_at = NOW(), deleted_by = $2 WHERE post_id = $1`, [
      opened.post.postId,
      user.userId,
    ]);
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
  const result = await feed.listComments(target, { page, pageSize, canDelete: mayDeleteComment(user, post, group) });
  return { ...result, commentCount: await commentCountOf(post.postId) };
}

// ASSUMPTION: only live posts can be commented on or liked (a pending, rejected or hidden post is not in the feed).
export async function createComment(user, postId, { content, parentCommentId }) {
  const { group, comment, post } = await withTransaction(async (client) => {
    const opened = await openPost(client, user, postId, { lock: 'share' });
    assertWritable(opened.group);
    assertLive(opened.post);
    const row = await feed.insertComment(opened.target, { authorId: user.userId, content, parentCommentId }, client);
    return { ...opened, comment: { ...row, canDelete: true } };
  });
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

// --- UC-44 Pin / Unpin, UC-45 Hide / Unhide, UC-46 Approve / Reject (moderator) -------------------------------------

// One moderator action on a locked post. change(client, post, group) writes and returns true, or returns false when
// the post is already in the wanted state (idempotent: 200, nothing written, no signal).
async function moderate(user, postId, changeName, change) {
  const { group, before, post, changed } = await withTransaction(async (client) => {
    const opened = await openPost(client, user, postId, { lock: 'update' });
    assertWritable(opened.group);
    assertModerator(opened.group);
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

/** UC-46: approve or reject a PENDING post (else 409 MSG_POST_NOT_PENDING). No reason is stored (§5). */
export function reviewPost(user, postId, decision) {
  const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  return moderate(user, postId, decision === 'APPROVE' ? 'approved' : 'rejected', async (client, post) => {
    if (post.approvalStatus !== 'PENDING') throw conflict('MSG_POST_NOT_PENDING', 'The post is not waiting for approval.');
    await client.query(
      `UPDATE posts SET approval_status = $2, reviewed_by = $3, reviewed_at = NOW() WHERE post_id = $1`,
      [post.postId, status, user.userId],
    );
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
