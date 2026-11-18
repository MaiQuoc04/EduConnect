import { groupScopeSql } from '../groups/groupAccess.js';

// FE-09 (Quoc, 18/11/2026, lead): a general notification when a post appears in a group feed (FE-05) – the class groups
// (GENERAL / STUDENT / PARENT) and the teacher group (TEACHER_SCHOOL).
// When: the post becomes live – created APPROVED (moderator, or approval off) or approved by the moderator (an edited
// post approved again counts as a new post, business rules §5). A pending post, an edit, a rejection: nothing.
// Who: every active member of the group except the author, under each role with which they see that group's feed –
// exactly FE-04's groupScopeSql (a teacher who is also a parent of the class gets the GENERAL group post under both
// roles); School Managers only in the teacher group (they never see class feeds, business rules §2).
// Called inside the transaction that makes the post live, so it is written (and pushed, LISTEN/NOTIFY) only on COMMIT.
async function loadPost(db, postId) {
  const { rows } = await db.query(
    `SELECT p.post_id AS "postId", p.author_id AS "authorId", p.content, g.group_id AS "groupId",
            g.group_name AS "groupName", g.group_type AS "groupType", g.class_id AS "classId", u.full_name AS "authorName"
     FROM posts p JOIN groups g ON g.group_id = p.group_id JOIN users u ON u.user_id = p.author_id
     WHERE p.post_id = $1`,
    [postId],
  );
  return rows[0] ?? null;
}

// The post text on one line, cut to `max` characters.
function excerptOf(content, max) {
  const flat = String(content ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat;
}
const cut = (text) => [...text].slice(0, 255).join('');

export async function notifyGroupPost(db, { postId }) {
  const post = await loadPost(db, postId);
  if (!post) return 0;
  const excerpt = excerptOf(post.content, 80);
  const title = cut(`${post.authorName} đăng bài mới trong nhóm ${post.groupName}${excerpt ? `: ${excerpt}` : ''}`);
  const { rows } = await db.query(
    `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
     VALUES ('GROUP_POST', $1, NULL, FALSE, 'POST', $2, $3) RETURNING notification_id AS "id"`,
    [title, post.postId, post.authorId],
  );
  const { rowCount } = await db.query(
    `INSERT INTO notification_recipients (notification_id, user_id, role_code)
     SELECT DISTINCT $1::bigint, gm.user_id, r.role_code
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.group_id AND gm.left_at IS NULL
     JOIN users u ON u.user_id = gm.user_id AND u.status = 'ACTIVE'
     JOIN user_roles ur ON ur.user_id = gm.user_id
     JOIN roles r ON r.role_id = ur.role_id
     WHERE g.group_id = $2 AND gm.user_id <> $3
       AND r.role_code IN ('TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_MANAGER')
       AND (r.role_code <> 'SCHOOL_MANAGER' OR g.group_type = 'TEACHER_SCHOOL')
       AND ${groupScopeSql('gm.user_id', 'r.role_code')}`,
    [rows[0].id, post.groupId, post.authorId],
  );
  return rowCount;
}

/**
 * FE-09 (lead 18/11/2026): a PERSONAL notification to the moderator when a post waits for approval – created PENDING,
 * or edited back to PENDING (a rejected / hidden / approved post edited while approval is on). Moderators = the
 * homeroom teacher of the class for the class group (role TEACHER), every School Manager for the teacher group (role
 * SCHOOL_MANAGER), active accounts, never the author. No moderator (class without homeroom teacher): nothing.
 * target_type POST_PENDING: listed only while the post is still pending (gone once approved, rejected or deleted).
 */
export async function notifyPostPending(db, { postId }) {
  const post = await loadPost(db, postId);
  if (!post) return 0;
  const { rows: mods } =
    post.groupType === 'GENERAL'
      ? await db.query(
          `SELECT t.user_id, 'TEACHER' AS role_code FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
           JOIN users u ON u.user_id = t.user_id AND u.status = 'ACTIVE'
           WHERE c.class_id = $1 AND t.user_id <> $2`,
          [post.classId, post.authorId],
        )
      : await db.query(
          `SELECT ur.user_id, 'SCHOOL_MANAGER' AS role_code FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
           JOIN users u ON u.user_id = ur.user_id AND u.status = 'ACTIVE'
           WHERE r.role_code = 'SCHOOL_MANAGER' AND ur.user_id <> $1`,
          [post.authorId],
        );
  if (!mods.length) return 0;
  const excerpt = excerptOf(post.content, 300);
  const { rows } = await db.query(
    `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
     VALUES ('GROUP_POST', $1, $2, TRUE, 'POST_PENDING', $3, $4) RETURNING notification_id AS "id"`,
    [
      cut(`Bài chờ duyệt trong nhóm ${post.groupName}: ${post.authorName}`),
      `${post.authorName} gửi một bài viết chờ duyệt trong nhóm ${post.groupName}${excerpt ? `: “${excerpt}”` : '.'} ` +
        'Mở bài để duyệt hoặc từ chối (tab Chờ duyệt của bảng tin nhóm).',
      post.postId,
      post.authorId,
    ],
  );
  await db.query(
    `INSERT INTO notification_recipients (notification_id, user_id, role_code)
     SELECT $1, UNNEST($2::bigint[]), UNNEST($3::varchar[])`,
    [rows[0].id, mods.map((m) => m.user_id), mods.map((m) => m.role_code)],
  );
  return mods.length;
}

/**
 * FE-09 (lead 18/11/2026): a PERSONAL notification to the author when the moderator approves or rejects their post.
 * The author gets it under each role with which they see the group's feed (FE-04 groupScopeSql; a post does not
 * store the role it was written under). target_type POST_REVIEW: listed while the post exists (not deleted).
 */
export async function notifyPostReviewed(db, { postId, approved, reviewerId }) {
  const post = await loadPost(db, postId);
  if (!post) return 0;
  const excerpt = excerptOf(post.content, 120);
  const title = approved
    ? `Bài viết của bạn trong nhóm ${post.groupName} đã được duyệt`
    : `Bài viết của bạn trong nhóm ${post.groupName} chưa được duyệt`;
  const detail = approved
    ? `Bài viết${excerpt ? ` “${excerpt}”` : ''} đã được duyệt và hiện trên bảng tin nhóm ${post.groupName}.`
    : `Bài viết${excerpt ? ` “${excerpt}”` : ''} đã bị từ chối nên không hiện trên bảng tin nhóm ${post.groupName}. ` +
      'Bạn có thể sửa bài trong mục Bài của tôi để gửi duyệt lại.';
  const { rows } = await db.query(
    `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
     VALUES ('GROUP_POST', $1, $2, TRUE, 'POST_REVIEW', $3, $4) RETURNING notification_id AS "id"`,
    [cut(title), detail, post.postId, reviewerId],
  );
  const { rowCount } = await db.query(
    `INSERT INTO notification_recipients (notification_id, user_id, role_code)
     SELECT DISTINCT $1::bigint, gm.user_id, r.role_code
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.group_id AND gm.left_at IS NULL AND gm.user_id = $3
     JOIN users u ON u.user_id = gm.user_id AND u.status = 'ACTIVE'
     JOIN user_roles ur ON ur.user_id = gm.user_id
     JOIN roles r ON r.role_id = ur.role_id
     WHERE g.group_id = $2
       AND r.role_code IN ('TEACHER', 'STUDENT', 'PARENT', 'SCHOOL_MANAGER')
       AND (r.role_code <> 'SCHOOL_MANAGER' OR g.group_type = 'TEACHER_SCHOOL')
       AND ${groupScopeSql('gm.user_id', 'r.role_code')}`,
    [rows[0].id, post.groupId, post.authorId],
  );
  return rowCount;
}
