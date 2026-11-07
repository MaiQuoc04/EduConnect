import { pool, withTransaction } from '../../config/db.js';
import { badRequest, forbidden, notFound } from '../../utils/AppError.js';
import { containsPattern, VI_TRANSLATE } from '../../utils/search.js';
// FE-02 (merged): the one rule for "the current school year" and "the class a student studies in this year".
import { enrollmentsOfYear, resolveSchoolYearId } from '../students/students.service.js';

// FE-08 School Feed (owner: Anh), iteration 2.
//   Stage 1 (reading): UC-58 View School Feed & News, UC-59 View School Post Detail (SCR-02, SCR-05).
//   Stage 2 (School Manager writes): UC-60 Create, UC-61 Update, UC-62 Delete, UC-63 Pin / Unpin (SCR-31, SCR-06).
//   Later: likes, comments (UC-64..UC-66) and attachments (business-rules §15: storage provider not decided yet).
//
// Schema v0.3: school_posts, comments, attachments and classes have deleted_at; users, students, parents,
// class_enrollments, student_parents, post_likes, grade_levels, the two *_targets tables, notifications and
// notification_recipients do not. school_posts has no updated_at trigger: UC-61 sets updated_at itself.
//
// comments / post_likes / attachments are shared with FE-05 Group Feed (each row belongs to exactly one of post_id /
// school_post_id). The counting helpers below only read school_post_id, take a list of ids and stay apart from the
// post query, so they can be merged with FE-05's once both features are on develop (iteration-plan.md).

// Roles that see school posts (permissions.md "School post – View"). System Admin sees no content (§1).
const READER_ROLES = ['SCHOOL_MANAGER', 'TEACHER', 'STUDENT', 'PARENT'];

// --- Who is in which class (one definition for UC-58 / UC-59 visibility AND UC-60 notification recipients) ----

/**
 * SQL subquery of every (user_id, role_code, class_id, grade_level_id) that puts a role of a user in a class of
 * school year $1 (params[0] MUST be that year, possibly null = no year → no rows). Pushes its own values on params.
 *   TEACHER  homeroom teacher of the class (classes.homeroom_teacher_id), or a teaching assignment in it that is not
 *            deleted and not ended.
 *   STUDENT  a STUDYING enrollment in the class (FE-02 enrollmentsOfYear: a student studies in one class a year).
 *   PARENT   a linked child (student_parents) with a STUDYING enrollment in the class.
 * ASSUMPTION: a teaching assignment counts while end_date >= CURRENT_DATE (current or future), the same rule FE-04
 * uses for class groups (classPeopleSql in classes/classGroups.js; not imported, FE-04 code is only read here).
 * Classes are per school year, so a student of 10A1 2026-2027 is not in the 10A1 of another year.
 */
function classAudienceSql(params) {
  const studying = () => enrollmentsOfYear(params, { status: 'STUDYING' });
  return `(
    SELECT t.user_id, 'TEACHER'::text AS role_code, c.class_id, c.grade_level_id
    FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
    WHERE c.school_year_id = $1 AND c.deleted_at IS NULL
    UNION
    SELECT t.user_id, 'TEACHER', c.class_id, c.grade_level_id
    FROM teaching_assignments ta
    JOIN teachers t ON t.teacher_id = ta.teacher_id
    JOIN classes c ON c.class_id = ta.class_id
    WHERE c.school_year_id = $1 AND c.deleted_at IS NULL AND ta.deleted_at IS NULL AND ta.end_date >= CURRENT_DATE
    UNION
    SELECT s.user_id, 'STUDENT', c.class_id, c.grade_level_id
    FROM ${studying()}
    JOIN students s ON s.student_id = e.student_id
    JOIN classes c ON c.class_id = e.class_id
    UNION
    SELECT p.user_id, 'PARENT', c.class_id, c.grade_level_id
    FROM ${studying()}
    JOIN student_parents spa ON spa.student_id = e.student_id
    JOIN parents p ON p.parent_id = spa.parent_id
    JOIN classes c ON c.class_id = e.class_id
  )`;
}

/**
 * The target rule of business-rules §8, written once. A post (alias sp) reaches an audience when it has no target
 * row at all (= whole school), or ANY grade target passes matchGrade, or ANY class target passes matchClass (a post
 * may target grades and classes at the same time). matchGrade / matchClass get a column and return a SQL condition.
 * A target row pointing to a class deleted later still counts as a target: the post does not become whole-school.
 */
function audienceMatchSql(sp, matchGrade, matchClass) {
  return `(
       (NOT EXISTS (SELECT 1 FROM school_post_grade_targets vg WHERE vg.school_post_id = ${sp}.school_post_id)
        AND NOT EXISTS (SELECT 1 FROM school_post_class_targets vc WHERE vc.school_post_id = ${sp}.school_post_id))
       OR EXISTS (SELECT 1 FROM school_post_grade_targets vg
                  WHERE vg.school_post_id = ${sp}.school_post_id AND ${matchGrade('vg.grade_level_id')})
       OR EXISTS (SELECT 1 FROM school_post_class_targets vc
                  WHERE vc.school_post_id = ${sp}.school_post_id AND ${matchClass('vc.class_id')}))`;
}

// --- Who sees which post (business-rules §8, permissions.md "School post – View", note 8) ----------------------

/**
 * The audience the signed-in user belongs to, for the ACTIVE role only (business-rules §1, never the union).
 *   SCHOOL_MANAGER → { everyone: true }: every post, also those sent to a class they have nothing to do with.
 *   TEACHER / STUDENT / PARENT → their classes of the current school year and those classes' grades
 *   (classAudienceSql; "current school year" = FE-02 resolveSchoolYearId, business-rules §4 "School years").
 * System Admin sees no content (business-rules §1): the route refuses it; refused here too, so no caller can forget.
 * Nobody in a class (student not placed yet, parent with no linked child, no school year at all) → empty lists, which
 * still gives the whole-school posts. Not an error.
 *
 * @returns {Promise<{ everyone: true } | { everyone: false, classIds: number[], gradeLevelIds: number[] }>}
 */
export async function resolveAudience({ userId, activeRole }, db = pool) {
  if (activeRole === 'SCHOOL_MANAGER') return { everyone: true };
  if (!READER_ROLES.includes(activeRole)) throw forbidden();

  const none = { everyone: false, classIds: [], gradeLevelIds: [] };
  const yearId = await resolveSchoolYearId({}, db);
  if (!yearId) return none;

  const params = [yearId];
  const ca = classAudienceSql(params);
  params.push(userId, activeRole);
  const { rows } = await db.query(
    `SELECT DISTINCT ca.class_id AS "classId", ca.grade_level_id AS "gradeLevelId"
     FROM ${ca} ca
     WHERE ca.user_id = $${params.length - 1} AND ca.role_code = $${params.length}`,
    params,
  );
  return {
    everyone: false,
    classIds: [...new Set(rows.map((r) => r.classId))],
    gradeLevelIds: [...new Set(rows.map((r) => r.gradeLevelId))],
  };
}

/**
 * THE visibility condition of school posts, used by UC-58 and UC-59 alike (one place, so the list and the detail
 * can never disagree). Includes "not deleted". Pushes its values onto params.
 *
 * @param {Awaited<ReturnType<typeof resolveAudience>>} audience
 * @param {unknown[]} params
 * @param {string} sp alias of school_posts in the surrounding query
 */
export function visibleSchoolPostsSql(audience, params, sp = 'sp') {
  const notDeleted = `${sp}.deleted_at IS NULL`;
  if (audience.everyone) return notDeleted;
  params.push(audience.gradeLevelIds);
  const grades = `$${params.length}::bigint[]`;
  params.push(audience.classIds);
  const classes = `$${params.length}::bigint[]`;
  return `${notDeleted} AND ${audienceMatchSql(sp, (col) => `${col} = ANY(${grades})`, (col) => `${col} = ANY(${classes})`)}`;
}

/**
 * SELECT of the users who can see school post $postId – the same set as visibleSchoolPostsSql seen from the post's
 * side: a user is in it when ANY of their roles sees the post in UC-58 / UC-59 (one row per user, even with several
 * roles, as notification_recipients has PRIMARY KEY (notification_id, user_id)).
 *   - every School Manager (they see every post);
 *   - every Teacher / Student / Parent when the post has no target (whole school);
 *   - otherwise a Teacher / Student / Parent whose role is in a target class or in a class of a target grade
 *     (classAudienceSql + audienceMatchSql: the very rule UC-58 uses).
 * System Admin is never in it (business-rules §1); SA is an exclusive role (§1), so an SA account has no other role.
 * ASSUMPTION: LOCKED accounts are included. Accounts are locked, never deleted (§3), so they find the notification
 * when they are unlocked; the bell is only read after signing in anyway.
 * params[0] MUST be the current school year (resolveSchoolYearId, may be null).
 */
function recipientsSql(params, postIdPlaceholder) {
  const ca = classAudienceSql(params);
  const inClassOf = (column) => (col) => `EXISTS (SELECT 1 FROM ca
                   WHERE ca.user_id = ur.user_id AND ca.role_code = r.role_code AND ca.${column} = ${col})`;
  return `WITH ca AS ${ca}
     SELECT DISTINCT ur.user_id AS "userId"
     FROM user_roles ur
     JOIN roles r ON r.role_id = ur.role_id
     JOIN school_posts sp ON sp.school_post_id = ${postIdPlaceholder} AND sp.deleted_at IS NULL
     WHERE r.role_code = 'SCHOOL_MANAGER'
        OR (r.role_code IN ('TEACHER', 'STUDENT', 'PARENT')
            AND ${audienceMatchSql('sp', inClassOf('grade_level_id'), inClassOf('class_id'))})`;
}

/** The user ids who can see a school post (see recipientsSql), sorted. Used by UC-60 and by the checks. */
export async function recipientsOfSchoolPost(schoolPostId, db = pool) {
  const params = [await resolveSchoolYearId({}, db)];
  params.push(schoolPostId);
  const { rows } = await db.query(`${recipientsSql(params, `$${params.length}`)} ORDER BY 1`, params);
  return rows.map((r) => r.userId);
}

// --- Helpers shared by UC-58 and UC-59 (each takes a list of post ids, runs one query) --------------------------

/**
 * Likes per school post: Map id → { likeCount, likedByMe }. Posts with no like are missing from the map.
 * Callers pass ANNOUNCEMENT ids only: NEWS cannot be liked (business-rules §8), so it always shows 0 / false.
 */
export async function countSchoolPostLikes(schoolPostIds, userId, db = pool) {
  if (!schoolPostIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT school_post_id AS "schoolPostId", COUNT(*) AS "likeCount", BOOL_OR(user_id = $2) AS "likedByMe"
     FROM post_likes
     WHERE school_post_id = ANY($1::bigint[])
     GROUP BY school_post_id`,
    [schoolPostIds, userId],
  );
  return new Map(rows.map(({ schoolPostId, ...counts }) => [schoolPostId, counts]));
}

/**
 * Comments per school post (not deleted, replies included): Map id → commentCount. ANNOUNCEMENT ids only (§8).
 * ASSUMPTION: a reply whose parent comment was deleted still counts; it is deleted only when it is deleted itself.
 */
export async function countSchoolPostComments(schoolPostIds, db = pool) {
  if (!schoolPostIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT school_post_id AS "schoolPostId", COUNT(*) AS "commentCount"
     FROM comments
     WHERE school_post_id = ANY($1::bigint[]) AND deleted_at IS NULL
     GROUP BY school_post_id`,
    [schoolPostIds],
  );
  return new Map(rows.map((r) => [r.schoolPostId, r.commentCount]));
}

/** Attachments per school post (not deleted): Map id → { attachmentCount, firstImageUrl }. */
async function summarizeAttachments(schoolPostIds, db = pool) {
  if (!schoolPostIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT school_post_id AS "schoolPostId", COUNT(*) AS "attachmentCount",
            (array_agg(file_url ORDER BY created_at, attachment_id) FILTER (WHERE mime_type LIKE 'image/%'))[1]
              AS "firstImageUrl"
     FROM attachments
     WHERE school_post_id = ANY($1::bigint[]) AND deleted_at IS NULL
     GROUP BY school_post_id`,
    [schoolPostIds],
  );
  return new Map(rows.map(({ schoolPostId, ...summary }) => [schoolPostId, summary]));
}

/**
 * Grade and class targets per post: Map id → { gradeTargets, classTargets }. Posts without targets are missing.
 * Soft-deleted classes are left out of the names shown (business-rules §14); they still count for visibility.
 */
async function findTargets(schoolPostIds, db = pool) {
  const targets = new Map();
  if (!schoolPostIds.length) return targets;
  const entry = (id) => {
    if (!targets.has(id)) targets.set(id, { gradeTargets: [], classTargets: [] });
    return targets.get(id);
  };
  // One after the other: DB_POOL_MAX=3 on the shared Supabase pooler (README §6).
  const { rows: grades } = await db.query(
    `SELECT gt.school_post_id AS "schoolPostId", gl.grade_level_id AS "gradeLevelId",
            gl.grade_level_name AS "gradeLevelName"
     FROM school_post_grade_targets gt
     JOIN grade_levels gl ON gl.grade_level_id = gt.grade_level_id
     WHERE gt.school_post_id = ANY($1::bigint[])
     ORDER BY gl.grade_level_name, gl.grade_level_id`,
    [schoolPostIds],
  );
  for (const { schoolPostId, ...grade } of grades) entry(schoolPostId).gradeTargets.push(grade);
  const { rows: classes } = await db.query(
    `SELECT ct.school_post_id AS "schoolPostId", c.class_id AS "classId", c.class_name AS "className",
            sy.year_name AS "schoolYearName"
     FROM school_post_class_targets ct
     JOIN classes c ON c.class_id = ct.class_id AND c.deleted_at IS NULL
     JOIN school_years sy ON sy.school_year_id = c.school_year_id
     WHERE ct.school_post_id = ANY($1::bigint[])
     ORDER BY sy.start_date DESC, c.class_name, c.class_id`,
    [schoolPostIds],
  );
  for (const { schoolPostId, ...cls } of classes) entry(schoolPostId).classTargets.push(cls);
  return targets;
}

// "SCHOOL" when the post has no target row (business-rules §8: whole school), "TARGETED" otherwise. Read from the
// rows themselves, not from the names, so a post whose only target class was deleted stays TARGETED.
const AUDIENCE_TYPE = (sp) => `CASE WHEN EXISTS (SELECT 1 FROM school_post_grade_targets ag WHERE ag.school_post_id = ${sp}.school_post_id)
              OR EXISTS (SELECT 1 FROM school_post_class_targets ac WHERE ac.school_post_id = ${sp}.school_post_id)
            THEN 'TARGETED' ELSE 'SCHOOL' END`;

// Likes and comments only exist on announcements (business-rules §8); NEWS always shows 0 / 0 / false.
async function interactionsOf(posts, userId, db = pool) {
  const ids = posts.filter((p) => p.postType === 'ANNOUNCEMENT').map((p) => p.schoolPostId);
  const likes = await countSchoolPostLikes(ids, userId, db);
  const comments = await countSchoolPostComments(ids, db);
  return (post) => {
    if (post.postType !== 'ANNOUNCEMENT') return { likeCount: 0, commentCount: 0, likedByMe: false };
    const like = likes.get(post.schoolPostId);
    return {
      likeCount: like?.likeCount ?? 0,
      commentCount: comments.get(post.schoolPostId) ?? 0,
      likedByMe: like?.likedByMe ?? false,
    };
  };
}

// --- UC-58 View School Feed & News (SCR-02) ----------------------------------------------------------------------

// ASSUMPTION: the list shows the first 300 characters of the content, white space collapsed, with "…" when cut.
export const PREVIEW_LENGTH = 300;

/**
 * UC-58: the posts the reader may see, pinned first, then newest first. One list for both types: SCR-02 shows the
 * feed (announcements) and the news column separately, so the client calls it twice with postType=ANNOUNCEMENT and
 * postType=NEWS (each with its own paging). An empty list is a normal result (MSG01). Viewing is not logged (§13).
 */
export async function listSchoolPosts(user, { postType, q, page, pageSize }) {
  const audience = await resolveAudience(user);
  const params = [];
  const conditions = [visibleSchoolPostsSql(audience, params)];
  if (postType) {
    params.push(postType);
    conditions.push(`sp.post_type = $${params.length}`);
  }
  // Business-rules §16: "contains", ignoring case and accents, % and _ matched literally (utils/search.js).
  const pattern = containsPattern(q);
  if (pattern) {
    params.push(pattern, VI_TRANSLATE.from, VI_TRANSLATE.to);
    const [p, from, to] = [params.length - 2, params.length - 1, params.length].map((n) => `$${n}`);
    const fold = (column) => `lower(translate(${column}, ${from}, ${to}))`;
    conditions.push(`(${fold('sp.title')} LIKE ${p} OR ${fold('sp.content')} LIKE ${p})`);
  }
  const where = conditions.join(' AND ');

  // Run one after the other: DB_POOL_MAX=3 per developer on the shared pooler (README §6).
  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS total FROM school_posts sp WHERE ${where}`, params);
  const { rows: posts } = await pool.query(
    `SELECT sp.school_post_id AS "schoolPostId", sp.title,
            CASE WHEN char_length(pv.flat) > ${PREVIEW_LENGTH} THEN left(pv.flat, ${PREVIEW_LENGTH}) || '…'
                 ELSE pv.flat END AS "contentPreview",
            sp.post_type AS "postType", sp.is_pinned AS "isPinned",
            sp.created_at AS "createdAt", sp.updated_at AS "updatedAt",
            sp.author_id AS "authorId", u.full_name AS "authorName", u.avatar_url AS "authorAvatarUrl",
            ${AUDIENCE_TYPE('sp')} AS "audienceType"
     FROM school_posts sp
     JOIN users u ON u.user_id = sp.author_id
     CROSS JOIN LATERAL (SELECT regexp_replace(btrim(sp.content), '\\s+', ' ', 'g') AS flat) pv
     WHERE ${where}
     ORDER BY sp.is_pinned DESC, sp.created_at DESC, sp.school_post_id DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  const ids = posts.map((p) => p.schoolPostId);
  const interactions = await interactionsOf(posts, user.userId);
  const attachments = await summarizeAttachments(ids);
  const targets = await findTargets(ids);
  const items = posts.map((post) => {
    const t = targets.get(post.schoolPostId);
    return {
      ...post,
      // ASSUMPTION: returned to every role, not only School Manager: grade and class names are not personal data
      // and tell the reader why they get the post ("Khối 10", "11D1"). null for a whole-school post. The client
      // writes the Vietnamese words ("Toàn trường", "Khối …").
      audienceSummary: post.audienceType === 'SCHOOL' ? null : {
        gradeLevelNames: t?.gradeTargets.map((g) => g.gradeLevelName) ?? [],
        classNames: t?.classTargets.map((c) => c.className) ?? [],
      },
      ...interactions(post),
      attachmentCount: attachments.get(post.schoolPostId)?.attachmentCount ?? 0,
      firstImageUrl: attachments.get(post.schoolPostId)?.firstImageUrl ?? null,
    };
  });
  return { items, page, pageSize, total: countRows[0].total };
}

// --- UC-59 View School Post Detail (SCR-05) ----------------------------------------------------------------------

/**
 * UC-59: one post with its targets, counts and attachments. A post that does not exist, is deleted or is not
 * addressed to the reader gives the same 404, so nobody learns that a post outside their audience exists.
 * Comments themselves are listed by UC-65 (stage 3); only commentCount here.
 * Also the answer of UC-60..UC-63, read with their transaction client (db) so it sees their own writes.
 */
export async function getSchoolPost(user, schoolPostId, db = pool) {
  const audience = await resolveAudience(user, db);
  const params = [schoolPostId];
  const { rows } = await db.query(
    `SELECT sp.school_post_id AS "schoolPostId", sp.title, sp.content, sp.post_type AS "postType",
            sp.is_pinned AS "isPinned", sp.send_notification AS "sendNotification",
            sp.created_at AS "createdAt", sp.updated_at AS "updatedAt",
            sp.author_id AS "authorId", u.full_name AS "authorName", u.avatar_url AS "authorAvatarUrl",
            ${AUDIENCE_TYPE('sp')} AS "audienceType"
     FROM school_posts sp
     JOIN users u ON u.user_id = sp.author_id
     WHERE sp.school_post_id = $1 AND ${visibleSchoolPostsSql(audience, params)}`,
    params,
  );
  const post = rows[0];
  if (!post) throw schoolPostNotFound();

  const interactions = await interactionsOf([post], user.userId, db);
  const targets = (await findTargets([post.schoolPostId], db)).get(post.schoolPostId);
  const { rows: attachments } = await db.query(
    `SELECT attachment_id AS "attachmentId", file_url AS "fileUrl", file_name AS "fileName", mime_type AS "mimeType",
            size_bytes AS "sizeBytes", created_at AS "createdAt"
     FROM attachments
     WHERE school_post_id = $1 AND deleted_at IS NULL
     ORDER BY created_at, attachment_id`,
    [post.schoolPostId],
  );
  return {
    post: {
      ...post,
      // ASSUMPTION: the targets are returned to every role who can see the post (same reason as audienceSummary
      // in UC-58); School Manager needs them to know who got the post.
      gradeTargets: targets?.gradeTargets ?? [],
      classTargets: targets?.classTargets ?? [],
      ...interactions(post),
      // Lets the client hide like / comment on NEWS. UC-64 / UC-65 must refuse NEWS on the server themselves.
      canInteract: post.postType === 'ANNOUNCEMENT',
    },
    attachments,
  };
}

const schoolPostNotFound = () => notFound('MSG_SCHOOL_POST_NOT_FOUND', 'The school post was not found.');

// --- UC-60..UC-63 (School Manager only; the routes check the active role) ----------------------------------------
// Not logged: posting is not in the activity_logs list (business-rules §13).
// ASSUMPTION: School Managers have equal rights (§1), so any School Manager may edit / delete / pin any school post,
// not only its author.

/**
 * Checks the chosen grades and classes before anything is written. Throws 400 with the ids that are not allowed.
 *   - grades: must exist (grade_levels has no deleted_at).
 *   - classes: must exist, not be soft-deleted and belong to the CURRENT school year (resolveSchoolYearId).
 *     ASSUMPTION: classes of other school years (an ended year is read only, §4; a future year has nobody in it yet)
 *     are refused with MSG_CLASS_NOT_FOUND. UC-58 only puts readers in classes of the current year, so a post sent to
 *     another year's class would reach nobody but School Managers. During the summer break the current year is the
 *     one that just ended (business-rules §4), so its classes can still be chosen then.
 * Classes are read FOR SHARE so they cannot be soft-deleted before the transaction ends.
 */
async function checkTargets(client, { gradeLevelIds, classIds }) {
  if (gradeLevelIds.length) {
    const { rows } = await client.query(
      'SELECT grade_level_id AS id FROM grade_levels WHERE grade_level_id = ANY($1::bigint[])',
      [gradeLevelIds],
    );
    const found = new Set(rows.map((r) => r.id));
    const missing = gradeLevelIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw badRequest('MSG_GRADE_NOT_FOUND', 'A chosen grade level does not exist.', { gradeLevelIds: missing });
    }
  }
  if (classIds.length) {
    const yearId = await resolveSchoolYearId({}, client);
    const { rows } = await client.query(
      `SELECT class_id AS id FROM classes
       WHERE class_id = ANY($1::bigint[]) AND school_year_id = $2 AND deleted_at IS NULL
       FOR SHARE`,
      [classIds, yearId],
    );
    const found = new Set(rows.map((r) => r.id));
    const missing = classIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw badRequest('MSG_CLASS_NOT_FOUND', 'A chosen class does not exist in the current school year.',
        { classIds: missing });
    }
  }
}

// Writes the target rows of a post (ids already checked and de-duplicated). Two set-based INSERTs, no loop.
// Kept apart so UC-61 can reuse it once changing the audience is allowed (see updateSchoolPost).
async function saveTargets(client, schoolPostId, { gradeLevelIds, classIds }) {
  if (gradeLevelIds.length) {
    await client.query(
      `INSERT INTO school_post_grade_targets (school_post_id, grade_level_id)
       SELECT $1, unnest($2::bigint[])`,
      [schoolPostId, gradeLevelIds],
    );
  }
  if (classIds.length) {
    await client.query(
      `INSERT INTO school_post_class_targets (school_post_id, class_id)
       SELECT $1, unnest($2::bigint[])`,
      [schoolPostId, classIds],
    );
  }
}

// FE-09 is not built yet; team decision 07/11/2026: FE-08 writes its notifications itself, in the storage of
// business-rules §9: ONE notifications row (general, bell: is_personal = FALSE; opens the post through target_type /
// target_id) and ONE notification_recipients row per recipient (read_at NULL; student_id NULL, as it is not about one
// child), inserted with a single INSERT … SELECT (a school has thousands of accounts).
// Recipients = recipientsSql, i.e. exactly the users who see the post in UC-58 / UC-59, School Managers included.
// ASSUMPTION: the author is a School Manager and sees the post, so they get a row too (same set as the readers).
// ASSUMPTION: detail stays NULL: §9 keeps detailed text for personal notifications; the bell shows the title.
async function notifySchoolPost(client, { schoolPostId, title, createdBy }) {
  const { rows } = await client.query(
    `INSERT INTO notifications (type, title, detail, is_personal, target_type, target_id, created_by)
     VALUES ('SCHOOL_POST', $1, NULL, FALSE, 'SCHOOL_POST', $2, $3)
     RETURNING notification_id AS "notificationId"`,
    [[...title].slice(0, 255).join(''), schoolPostId, createdBy],
  );
  const { notificationId } = rows[0];
  const params = [await resolveSchoolYearId({}, client)];
  params.push(schoolPostId);
  const recipients = recipientsSql(params, `$${params.length}`);
  params.push(notificationId);
  await client.query(
    `INSERT INTO notification_recipients (notification_id, user_id, student_id, read_at)
     SELECT $${params.length}, r."userId", NULL, NULL
     FROM (${recipients}) r`,
    params,
  );
  return notificationId;
}

/**
 * UC-60 Create School Post (SCR-31). input is already validated by the controller:
 * { title, content, postType, sendNotification?, gradeLevelIds, classIds } (ids de-duplicated).
 * - sendNotification left out → the default of the type (§8; schema comment): ANNOUNCEMENT true, NEWS false.
 * - ANNOUNCEMENT needs at least one grade or class (§8); NEWS may have targets or none (none = whole school).
 * - Not pinned (UC-63 pins). Post, targets and notification are written together or not at all.
 * Attachments come later (§15): they will be one more step inside this same transaction.
 */
export async function createSchoolPost(user, input) {
  const { title, content, postType, gradeLevelIds, classIds } = input;
  if (postType === 'ANNOUNCEMENT' && !gradeLevelIds.length && !classIds.length) {
    throw badRequest('MSG_AUDIENCE_REQUIRED', 'An announcement needs at least one grade level or class.',
      { fields: ['gradeLevelIds', 'classIds'] });
  }
  const sendNotification = input.sendNotification ?? postType === 'ANNOUNCEMENT';

  return withTransaction(async (client) => {
    await checkTargets(client, { gradeLevelIds, classIds });
    const { rows } = await client.query(
      `INSERT INTO school_posts (author_id, title, content, post_type, send_notification, is_pinned, created_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
       RETURNING school_post_id AS "schoolPostId"`,
      [user.userId, title, content, postType, sendNotification],
    );
    const { schoolPostId } = rows[0];
    await saveTargets(client, schoolPostId, { gradeLevelIds, classIds });
    if (sendNotification) await notifySchoolPost(client, { schoolPostId, title, createdBy: user.userId });
    return getSchoolPost(user, schoolPostId, client);
  });
}

// Locks a post that is not deleted (two School Managers saving at once are applied one after the other), or 404.
async function lockSchoolPost(client, schoolPostId) {
  const { rows } = await client.query(
    `SELECT school_post_id AS "schoolPostId", post_type AS "postType"
     FROM school_posts WHERE school_post_id = $1 AND deleted_at IS NULL
     FOR UPDATE`,
    [schoolPostId],
  );
  if (!rows[0]) throw schoolPostNotFound();
  return rows[0];
}

// Columns UC-61 may write (the UPDATE is built only from these, never from the body's keys; the controller has
// already rejected every other field).
const EDITABLE_COLUMNS = { title: 'title', content: 'content' };

/**
 * UC-61 Update School Post (SCR-06): title and content (changes = { title?, content? }, validated).
 * Written only when a value really differs (IS DISTINCT FROM, as UC-09); then updated_at = NOW() (no trigger on
 * school_posts). Nothing changed → no write, updated_at kept, still 200.
 * ASSUMPTION: an update sends no new notification (§8 does not say so; one per typo fix would be noise).
 * NOT here, refused by the controller:
 *   - postType: ANNOUNCEMENT ↔ NEWS changes likes, comments, pinning and the notification already sent.
 *   - sendNotification: the notification was sent (or not) when the post was created.
 *   - gradeLevelIds / classIds: changing the audience means removing target rows, and school_post_grade_targets /
 *     school_post_class_targets have no deleted_at and are not in the hard-delete list (business-rules §14, schema
 *     header). Waiting for the lead. Once allowed: DELETE both target tables for the post, checkTargets +
 *     saveTargets in this transaction, and keep at least one target for an ANNOUNCEMENT (MSG_AUDIENCE_REQUIRED).
 */
export async function updateSchoolPost(user, schoolPostId, changes) {
  return withTransaction(async (client) => {
    await lockSchoolPost(client, schoolPostId);
    const params = [schoolPostId];
    const sets = [];
    const differs = [];
    for (const [field, column] of Object.entries(EDITABLE_COLUMNS)) {
      if (!Object.hasOwn(changes, field)) continue;
      params.push(changes[field]);
      sets.push(`${column} = $${params.length}`);
      differs.push(`${column} IS DISTINCT FROM $${params.length}`);
    }
    if (sets.length) {
      await client.query(
        `UPDATE school_posts SET ${sets.join(', ')}, updated_at = NOW()
         WHERE school_post_id = $1 AND (${differs.join(' OR ')})`,
        params,
      );
    }
    return getSchoolPost(user, schoolPostId, client);
  });
}

/**
 * UC-62 Delete School Post: soft delete (business-rules §14), deleted_at = NOW(), deleted_by = the School Manager.
 * Comments, likes, attachments and the notification already sent stay as they are; the post simply no longer shows
 * (every read filters deleted_at). Already deleted → 404.
 * Returns the UC-59 object as it was just before the delete (read inside the transaction; afterwards UC-59 gives 404).
 */
export async function deleteSchoolPost(user, schoolPostId) {
  return withTransaction(async (client) => {
    await lockSchoolPost(client, schoolPostId);
    const result = await getSchoolPost(user, schoolPostId, client);
    await client.query(
      'UPDATE school_posts SET deleted_at = NOW(), deleted_by = $2 WHERE school_post_id = $1 AND deleted_at IS NULL',
      [schoolPostId, user.userId],
    );
    return result;
  });
}

/**
 * UC-63 Pin / Unpin School Post. Only announcements can be pinned (§8): pinning NEWS → 400 MSG_CANNOT_PIN_NEWS.
 * No limit on how many posts are pinned at once (§8 sets none). Same value as now → no write, still 200.
 * ASSUMPTION: unpinning NEWS (isPinned false) is accepted as a no-op, since NEWS is never pinned.
 * ASSUMPTION: pinning is not an edit of the post, so updated_at is not touched.
 */
export async function pinSchoolPost(user, schoolPostId, isPinned) {
  return withTransaction(async (client) => {
    const post = await lockSchoolPost(client, schoolPostId);
    if (isPinned && post.postType !== 'ANNOUNCEMENT') {
      throw badRequest('MSG_CANNOT_PIN_NEWS', 'Only announcements can be pinned.', { field: 'isPinned' });
    }
    await client.query(
      'UPDATE school_posts SET is_pinned = $2 WHERE school_post_id = $1 AND is_pinned IS DISTINCT FROM $2',
      [schoolPostId, isPinned],
    );
    return getSchoolPost(user, schoolPostId, client);
  });
}
