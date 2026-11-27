import { pool, withTransaction } from '../config/db.js';
import { AppError, badRequest } from './AppError.js';
import { moderateText } from './moderationRules.js';
import { recordAutoViolation } from './moderationViolations.js';

// Likes and comments of a feed post – the data layer shared by FE-08 School Feed (school_posts, owner Anh) and FE-05
// Group Feed (posts, owner Khanh). post_likes and comments hold rows of both features: each row has exactly one of
// post_id / school_post_id (schema CHECK). Every function here takes a "target" naming that column:
//
//   { column: 'school_post_id', id: 12 }   FE-08 (UC-64..UC-66)
//   { column: 'post_id',        id: 34 }   FE-05 (UC-41..UC-43, UC-45)
//
// These functions only read and write rows. They check NOTHING about who may do it: the post's visibility and the
// role rules differ between the two feeds (school feed business-rules §8: SM deletes any comment, others their own;
// group feed §5: also the post's author and the group moderator, plus approval / hidden posts). The caller checks
// the post first (exists, visible, not deleted, may be interacted with), then calls these – inside its transaction
// when it locked the post (pass the transaction client as db).
//
// Rules that are the same for both feeds (business-rules §5, §14) live here:
//   - Only Like; one like per user per post; unlike REMOVES the row (post_likes is in the hard-delete list, §14).
//   - Comments are multi-level (parent_comment_id) and deleted SOFTLY (deleted_at / deleted_by).
//   - A reply's parent must be a comment of the same post, not deleted.
//   - A deleted comment is shown as a placeholder while it still has a reply that is not deleted (see listComments).
//   - Automatic content check (moderation phase 3, 25/11/2026, docs/moderation-plan.md): insertComment checks the
//     text; a comment that matches a rule is saved HIDDEN (hidden_at) with a moderation_violations row, in the same
//     transaction. A hidden comment exists only for its author (listComments with viewerId, flag isHidden); for
//     everyone else – counts, findComment and so like / reply / report / delete – it does not exist.

// The only column names that ever reach the SQL text (a column cannot be a $n placeholder).
// COMMENT (17/11/2026, post_likes.comment_id, patch_v0.3_comment_likes.sql): a like of a comment. It is accepted by
// the LIKE functions only (addLike / removeLike / countLikes / likeSummary); the comment functions below still take a
// post column only, so nothing changes for the existing callers.
export const FEED_COLUMNS = Object.freeze({
  GROUP_POST: 'post_id',
  SCHOOL_POST: 'school_post_id',
  COMMENT: 'comment_id',
});
const ALLOWED_COLUMNS = new Set([FEED_COLUMNS.GROUP_POST, FEED_COLUMNS.SCHOOL_POST]); // comments of a post
const LIKE_COLUMNS = new Set(Object.values(FEED_COLUMNS)); // post_likes targets

function columnOf(target, allowed = ALLOWED_COLUMNS) {
  if (!target || !allowed.has(target.column)) {
    throw new Error(`feedInteractions: unknown target column ${target?.column}`); // programming error → 500
  }
  return target.column;
}

// --- Likes (post_likes, hard delete) ------------------------------------------------------------------------------

/**
 * Adds the user's like to the post. Liking twice is not an error (idempotent): ON CONFLICT on the UNIQUE
 * (user_id, <column>) constraint, so two clicks at the same moment never raise 23505.
 * FE-05 passes { column: 'post_id', id }.
 * @param {{ column: 'post_id' | 'school_post_id', id: number }} target
 * @param {number} userId
 * @returns {Promise<boolean>} true when a row was added
 */
export async function addLike(target, userId, db = pool) {
  const column = columnOf(target, LIKE_COLUMNS);
  const { rowCount } = await db.query(
    `INSERT INTO post_likes (user_id, ${column}, created_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, ${column}) DO NOTHING`,
    [userId, target.id],
  );
  return rowCount > 0;
}

/**
 * Removes the user's like: HARD delete of the post_likes row (business-rules §14 – post_likes has no deleted_at).
 * Not liked → nothing happens, not an error. FE-05 passes { column: 'post_id', id }.
 * @returns {Promise<boolean>} true when a row was removed
 */
export async function removeLike(target, userId, db = pool) {
  const column = columnOf(target, LIKE_COLUMNS);
  const { rowCount } = await db.query(`DELETE FROM post_likes WHERE user_id = $1 AND ${column} = $2`, [
    userId,
    target.id,
  ]);
  return rowCount > 0;
}

/**
 * Likes of many posts in one query: Map postId → { likeCount, likedByMe }. Posts with no like are missing.
 * FE-05 passes column 'post_id'.
 * @param {'post_id' | 'school_post_id'} column
 * @param {number[]} ids
 * @param {number} userId the reader (likedByMe)
 */
export async function countLikes(column, ids, userId, db = pool) {
  columnOf({ column }, LIKE_COLUMNS);
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT ${column} AS "postId", COUNT(*) AS "likeCount", BOOL_OR(user_id = $2) AS "likedByMe"
     FROM post_likes
     WHERE ${column} = ANY($1::bigint[])
     GROUP BY ${column}`,
    [ids, userId],
  );
  return new Map(rows.map(({ postId, ...counts }) => [postId, counts]));
}

/** { likeCount, likedByMe } of one post (the answer of like / unlike). FE-05 passes { column: 'post_id', id }. */
export async function likeSummary(target, userId, db = pool) {
  const like = (await countLikes(columnOf(target, LIKE_COLUMNS), [target.id], userId, db)).get(target.id);
  return { likeCount: like?.likeCount ?? 0, likedByMe: like?.likedByMe ?? false };
}

/**
 * Comment likes of a tree from listComments (17/11/2026): adds likeCount and likedByMe to EVERY node, in ONE query
 * for the whole page whatever its size or depth (countLikes with every comment id, no query per node). A deleted
 * comment (placeholder) gets 0 / false: its likes stay in post_likes but are never shown, and it cannot be liked.
 * Returns a new tree; the input is not changed. Opt-in: listComments itself does not call it, so FE-05 sees no new
 * field until it calls this too (with its own permission checks done first).
 * @param {object[]} items the tree (nodes with commentId, isDeleted, replies)
 * @param {number} userId the reader (likedByMe)
 */
export async function withCommentLikes(items, userId, db = pool) {
  const ids = [];
  const walk = (list) => list.forEach((n) => { if (!n.isDeleted) ids.push(n.commentId); walk(n.replies); });
  walk(items);
  const likes = await countLikes(FEED_COLUMNS.COMMENT, ids, userId, db);
  const decorate = (list) =>
    list.map((n) => {
      const like = n.isDeleted ? null : likes.get(n.commentId);
      return { ...n, likeCount: like?.likeCount ?? 0, likedByMe: like?.likedByMe ?? false, replies: decorate(n.replies) };
    });
  return decorate(items);
}

// --- Comments (soft delete) ---------------------------------------------------------------------------------------

/**
 * Comments of many posts in one query: Map postId → commentCount. Counts every comment that is not deleted, replies
 * included – also a reply whose parent was deleted (it is still shown, under the placeholder). FE-05: 'post_id'.
 * A comment hidden by the automatic check is never counted, not even for its author (moderation, 25/11/2026).
 * @param {'post_id' | 'school_post_id'} column
 * @param {number[]} ids
 */
export async function countComments(column, ids, db = pool) {
  columnOf({ column });
  if (!ids.length) return new Map();
  const { rows } = await db.query(
    `SELECT ${column} AS "postId", COUNT(*) AS "commentCount"
     FROM comments
     WHERE ${column} = ANY($1::bigint[]) AND deleted_at IS NULL AND hidden_at IS NULL
     GROUP BY ${column}`,
    [ids],
  );
  return new Map(rows.map((r) => [r.postId, r.commentCount]));
}

/**
 * One comment of the post (deleted ones too, so the caller can tell "deleted" from "never existed"), or null when the
 * id does not exist or belongs to another post. forUpdate locks the row (delete); forShare keeps it from being deleted
 * until the transaction ends (reply). FE-05 passes { column: 'post_id', id }.
 * A comment hidden by the automatic check (hidden_at, moderation 25/11/2026) is returned as null, exactly like one that
 * never existed: liking, answering and reporting it get the same 404 / 400 as for a missing comment.
 * ASSUMPTION: its author cannot delete it either (deleting answers 404 too): only the School Manager decides about a
 * hidden comment (unhide, phase 6), and a deletion would take it out of the statistics screen behind their back.
 * @returns {Promise<{ commentId: number, parentCommentId: number | null, authorId: number, isDeleted: boolean } | null>}
 */
export async function findComment(target, commentId, { forUpdate = false, forShare = false } = {}, db = pool) {
  const column = columnOf(target);
  const lock = forUpdate ? 'FOR UPDATE' : forShare ? 'FOR SHARE' : '';
  const { rows } = await db.query(
    `SELECT comment_id AS "commentId", parent_comment_id AS "parentCommentId", author_id AS "authorId",
            deleted_at IS NOT NULL AS "isDeleted"
     FROM comments
     WHERE comment_id = $1 AND ${column} = $2 AND hidden_at IS NULL
     ${lock}`,
    [commentId, target.id],
  );
  return rows[0] ?? null;
}

// Fields of a comment as the API returns them (alias c = comments, u = users).
const COMMENT_FIELDS = `c.comment_id AS "commentId", c.parent_comment_id AS "parentCommentId", c.content,
       c.created_at AS "createdAt", c.updated_at AS "updatedAt", c.author_id AS "authorId",
       u.full_name AS "authorName", u.avatar_url AS "authorAvatarUrl", c.deleted_at IS NOT NULL AS "isDeleted",
       c.hidden_at IS NOT NULL AS "isHidden"`;

// The CONTENT_TYPE of moderation_violations for a comment of each feed.
const VIOLATION_CONTENT_TYPES = Object.freeze({
  [FEED_COLUMNS.SCHOOL_POST]: 'SCHOOL_COMMENT',
  [FEED_COLUMNS.GROUP_POST]: 'GROUP_COMMENT',
});

const inTransaction = (db, fn) => (db === pool ? withTransaction(fn) : fn(db));

/**
 * Writes a comment (content already validated). With parentCommentId it is a reply: the parent must be a comment of
 * the SAME post (else 400 MSG_INVALID_PARENT_COMMENT) and not deleted (else 409 MSG_PARENT_COMMENT_DELETED). The
 * parent is read FOR SHARE, so pass a transaction client: the parent cannot be deleted before the reply is saved.
 * Who may comment is NOT checked here. FE-05 passes { column: 'post_id', id }.
 * Automatic content check (moderation, 25/11/2026): the text is checked BEFORE the INSERT (moderateText never throws:
 * a broken filter lets the comment through). A match saves the comment hidden (hidden_at = NOW() in the INSERT itself)
 * and one moderation_violations row (source AUTO), with the same db – so with the caller's transaction there is no
 * moment when anyone else could read it. The caller must then send NO "new comment" signal and should notify the
 * author after COMMIT (utils/moderationNotify.js notifyContentHidden).
 * @param {{ column: 'post_id' | 'school_post_id', id: number }} target
 * @param {{ authorId: number, content: string, parentCommentId?: number | null }} comment
 * @returns {Promise<object>} the new comment, same fields as listComments (replies: [], isHidden), plus
 *   moderation: { hidden: true, category } when it was hidden, else null
 */
export async function insertComment(target, { authorId, content, parentCommentId = null }, db = pool) {
  const column = columnOf(target);
  if (parentCommentId != null) {
    const parent = await findComment(target, parentCommentId, { forShare: true }, db);
    if (!parent) {
      throw badRequest('MSG_INVALID_PARENT_COMMENT', 'The parent comment does not belong to this post.', {
        field: 'parentCommentId',
      });
    }
    // ASSUMPTION: a deleted comment cannot be answered (it stays only as a placeholder), like a chat message deleted
    // for everyone cannot be answered (business-rules §6).
    if (parent.isDeleted) {
      throw new AppError(409, 'MSG_PARENT_COMMENT_DELETED', 'The comment being answered has been deleted.', {
        field: 'parentCommentId',
      });
    }
  }
  const check = await moderateText(content);
  // The comment and its violation are written together (inTransaction: the caller's transaction when it gave one).
  return inTransaction(db, async (client) => {
    const { rows } = await client.query(
      `WITH c AS (
         INSERT INTO comments (${column}, parent_comment_id, author_id, content, created_at, hidden_at)
         VALUES ($1, $2, $3, $4, NOW(), CASE WHEN $5::boolean THEN NOW() END)
         RETURNING *)
       SELECT ${COMMENT_FIELDS} FROM c JOIN users u ON u.user_id = c.author_id`,
      [target.id, parentCommentId, authorId, content, check.hidden],
    );
    const comment = rows[0];
    if (!check.hidden) return { ...comment, replies: [], moderation: null };
    await recordAutoViolation(client, {
      contentType: VIOLATION_CONTENT_TYPES[column],
      commentId: comment.commentId,
      authorId,
      category: check.category,
      ruleIds: check.ruleIds,
    });
    return { ...comment, replies: [], moderation: { hidden: true, category: check.category } };
  });
}

/**
 * SOFT delete of a comment (business-rules §5: comments are deleted, never hidden): deleted_at = NOW(),
 * deleted_by = the user. Its replies stay. Already deleted or not of this post → false (nothing written).
 * Who may delete is NOT checked here (§8 vs §5 differ). FE-05 passes { column: 'post_id', id }.
 * @returns {Promise<boolean>} true when the comment was deleted now
 */
export async function softDeleteComment(target, commentId, deletedBy, db = pool) {
  const column = columnOf(target);
  const { rowCount } = await db.query(
    `UPDATE comments SET deleted_at = NOW(), deleted_by = $3
     WHERE comment_id = $1 AND ${column} = $2 AND deleted_at IS NULL`,
    [commentId, target.id, deletedBy],
  );
  return rowCount > 0;
}

/**
 * One page of the comments of a post, as a tree. Paged by TOP-LEVEL comment; each comes with ALL its replies, at
 * every level, nested in `replies`, so a thread is never cut in two pages.
 * Order (changed 09/11/2026, FE-08 stage 6 review; applies to BOTH feeds – FE-05 Group Feed uses this function too):
 *   - top-level comments: NEWEST first (created_at DESC, then comment_id DESC), as in Facebook / Zalo, so the latest
 *     conversation is on page 1. Page 2 continues with the next older threads; total and the offset count top-level
 *     comments, and comment_id breaks ties, so the order is total and stable: no thread is skipped or repeated
 *     between pages while nothing is added. A top-level comment posted meanwhile shifts the next page by one (the
 *     client should de-duplicate by commentId).
 *   - replies inside a thread, at every level: OLDEST first (created_at, then comment_id), so a conversation reads
 *     in the order it was written; a new reply goes to the end of its thread.
 * Deleted comments:
 *   ASSUMPTION: a deleted comment that still has a reply not deleted (at any depth below it) stays in the tree as a
 *   placeholder – isDeleted true, content / author fields null – so the conversation under it still reads; the client
 *   shows "Bình luận đã bị xoá". A deleted comment with nothing visible below it is left out entirely.
 *   The text and author of a deleted comment are never returned.
 * canDelete(comment) is the CALLER's permission rule (comment has authorId); it is called for comments not deleted
 * only; deleted ones get canDelete false. FE-05 passes { column: 'post_id', id } and its own §5 rule.
 * Hidden comments (automatic check, moderation 25/11/2026): returned ONLY to their author – viewerId, the reader's
 * user id – with isHidden true and canDelete false (see findComment). For anyone else a hidden comment does not exist:
 * it is dropped like a deleted one, and a thread whose only comments are hidden is not counted in `total`. Without
 * viewerId nobody's hidden comment is returned.
 * @param {{ column: 'post_id' | 'school_post_id', id: number }} target
 * @param {{ page: number, pageSize: number, canDelete: (comment: { authorId: number }) => boolean,
 *   viewerId?: number }} options
 * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>} total = top-level comments
 */
export async function listComments(target, { page, pageSize, canDelete, viewerId = null }, db = pool) {
  const column = columnOf(target);
  // What the reader may see of a comment row c: not deleted, and not hidden unless it is the reader's own.
  // $2 is the reader's user id in both queries below.
  const visible = `(c.deleted_at IS NULL AND (c.hidden_at IS NULL OR c.author_id = $2::bigint))`;
  // Every comment of the post with the top-level comment it hangs under. Replies always carry the post's column too.
  const tree = `WITH RECURSIVE tree AS (
       SELECT c.comment_id, c.comment_id AS root_id
       FROM comments c WHERE c.${column} = $1 AND c.parent_comment_id IS NULL
       UNION ALL
       SELECT c.comment_id, t.root_id
       FROM comments c JOIN tree t ON c.parent_comment_id = t.comment_id
       WHERE c.${column} = $1),
     roots AS (
       SELECT t.root_id
       FROM tree t JOIN comments c ON c.comment_id = t.comment_id
       GROUP BY t.root_id
       HAVING BOOL_OR(${visible}))`; // a thread with nothing left to show is not counted
  const { rows: countRows } = await db.query(`${tree} SELECT COUNT(*) AS total FROM roots`, [target.id, viewerId]);
  const { rows } = await db.query(
    `${tree},
     page_roots AS (
       SELECT r.root_id, ROW_NUMBER() OVER (ORDER BY c.created_at DESC, c.comment_id DESC) AS position
       FROM roots r JOIN comments c ON c.comment_id = r.root_id
       ORDER BY position
       LIMIT $3 OFFSET $4)
     SELECT ${COMMENT_FIELDS}, NOT ${visible} AND c.deleted_at IS NULL AS "hiddenFromReader"
     FROM tree t
     JOIN page_roots pr ON pr.root_id = t.root_id
     JOIN comments c ON c.comment_id = t.comment_id
     JOIN users u ON u.user_id = c.author_id
     ORDER BY pr.position, c.created_at, c.comment_id -- threads newest first; inside a thread oldest first`,
    [target.id, viewerId, pageSize, (page - 1) * pageSize],
  );
  return { items: buildTree(rows, canDelete), page, pageSize, total: countRows[0].total };
}

// Nests the flat rows and drops deleted comments with nothing visible below them. Keeps the row order: threads in
// the order of their top-level comment (newest first), replies oldest first (see listComments).
// A comment hidden from this reader (someone else's hidden comment) is treated exactly as a deleted one, so nothing
// tells it apart from a deletion; the reader's own hidden comment is shown with isHidden and cannot be deleted.
function buildTree(rows, canDelete) {
  const nodes = new Map(
    rows.map(({ hiddenFromReader, ...row }) => [
      row.commentId,
      hiddenFromReader ? { ...row, isDeleted: true, isHidden: false, replies: [] } : { ...row, replies: [] },
    ]),
  );
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parentCommentId == null ? null : nodes.get(node.parentCommentId);
    (parent ? parent.replies : roots).push(node);
  }
  const prune = (list) =>
    list.flatMap((node) => {
      node.replies = prune(node.replies);
      if (node.isDeleted) {
        if (!node.replies.length) return [];
        return [{ ...node, content: null, authorId: null, authorName: null, authorAvatarUrl: null, canDelete: false }];
      }
      if (node.isHidden) return [{ ...node, canDelete: false }];
      return [{ ...node, canDelete: Boolean(canDelete(node)) }];
    });
  return prune(roots);
}
