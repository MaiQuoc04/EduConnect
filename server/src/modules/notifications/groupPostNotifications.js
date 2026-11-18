import { groupScopeSql } from '../groups/groupAccess.js';

// FE-09 (Quoc, 18/11/2026, lead): a general notification when a post appears in a group feed (FE-05) – the class groups
// (GENERAL / STUDENT / PARENT) and the teacher group (TEACHER_SCHOOL).
// When: the post becomes live – created APPROVED (moderator, or approval off) or approved by the moderator (an edited
// post approved again counts as a new post, business rules §5). A pending post, an edit, a rejection: nothing.
// Who: every active member of the group except the author, under each role with which they see that group's feed –
// exactly FE-04's groupScopeSql (a teacher who is also a parent of the class gets the GENERAL group post under both
// roles); School Managers only in the teacher group (they never see class feeds, business rules §2).
// Called inside the transaction that makes the post live, so it is written (and pushed, LISTEN/NOTIFY) only on COMMIT.
export async function notifyGroupPost(db, { postId }) {
  const { rows: info } = await db.query(
    `SELECT p.post_id AS "postId", p.author_id AS "authorId", p.content, g.group_id AS "groupId",
            g.group_name AS "groupName", u.full_name AS "authorName"
     FROM posts p JOIN groups g ON g.group_id = p.group_id JOIN users u ON u.user_id = p.author_id
     WHERE p.post_id = $1`,
    [postId],
  );
  const post = info[0];
  if (!post) return 0;
  const flat = String(post.content ?? '').replace(/\s+/g, ' ').trim();
  const words = [...flat];
  const excerpt = words.length > 80 ? `${words.slice(0, 79).join('')}…` : flat;
  const title = [...`${post.authorName} đăng bài mới trong nhóm ${post.groupName}${excerpt ? `: ${excerpt}` : ''}`]
    .slice(0, 255)
    .join('');
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
