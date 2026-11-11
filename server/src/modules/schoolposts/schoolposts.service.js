import { pool, withTransaction } from '../../config/db.js';
import { emitToSchoolPost, emitToUsers } from '../../sockets/index.js';
import { badRequest, forbidden, notFound } from '../../utils/AppError.js';
// Attachment rows shared with FE-05 / FE-06 (data only, no permission check) and the storage they point to.
import * as files from '../../utils/attachments.js';
import { objectInfo, signedUrl } from '../../utils/storage.js';
import { getNumberSetting } from '../../utils/settings.js';
// The 15 types of the attachments bucket (read only; the shared upload module owns the list).
import { ATTACHMENT_TYPES } from '../uploads/uploads.service.js';
import { containsPattern, VI_TRANSLATE } from '../../utils/search.js';
// Likes / comments rows shared with FE-05 Group Feed: data only; who may do what in the school feed (§8) is here.
import * as feed from '../../utils/feedInteractions.js';
// FE-02 (merged): the one rule for "the current school year" and "the class a student studies in this year".
import { enrollmentsOfYear, resolveSchoolYearId } from '../students/students.service.js';

// FE-08 School Feed (owner: Anh), iteration 2.
//   Stage 1 (reading): UC-58 View School Feed & News, UC-59 View School Post Detail (SCR-02, SCR-05).
//   Stage 2 (School Manager writes): UC-60 Create, UC-61 Update, UC-62 Delete, UC-63 Pin / Unpin (SCR-31, SCR-06).
//   Stage 3 (interaction): UC-64 React (Like), UC-65 Comment, UC-66 Delete Comment (SCR-05).
//   Stage 6 of Supabase Storage (11/11/2026): attachments of UC-58..UC-62 through utils/attachments.js (files in the
//   PRIVATE attachments bucket; every read signs short-lived links).
//
// Schema v0.3: school_posts, comments, attachments and classes have deleted_at; users, students, parents,
// class_enrollments, student_parents, post_likes, grade_levels, the two *_targets tables, notifications and
// notification_recipients do not. school_posts has no updated_at trigger: UC-61 sets updated_at itself.
//
// comments / post_likes / attachments are shared with FE-05 Group Feed (each row belongs to exactly one of post_id /
// school_post_id). Reading and writing those rows lives in utils/feedInteractions.js (FE-05 reuses it with post_id);
// the permission checks of the SCHOOL feed (§8) stay in this file, never there.

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
 * `homeroom` is TRUE only on the homeroom teacher's row (a homeroom teacher who also teaches the class has both rows):
 * the homeroom teacher always gets a post sent to their class, whatever roles it targets (see homeroomMatchSql).
 */
function classAudienceSql(params) {
  const studying = () => enrollmentsOfYear(params, { status: 'STUDYING' });
  return `(
    SELECT t.user_id, 'TEACHER'::text AS role_code, c.class_id, c.grade_level_id, TRUE AS homeroom
    FROM classes c JOIN teachers t ON t.teacher_id = c.homeroom_teacher_id
    WHERE c.school_year_id = $1 AND c.deleted_at IS NULL
    UNION
    SELECT t.user_id, 'TEACHER', c.class_id, c.grade_level_id, FALSE
    FROM teaching_assignments ta
    JOIN teachers t ON t.teacher_id = ta.teacher_id
    JOIN classes c ON c.class_id = ta.class_id
    WHERE c.school_year_id = $1 AND c.deleted_at IS NULL AND ta.deleted_at IS NULL AND ta.end_date >= CURRENT_DATE
    UNION
    SELECT s.user_id, 'STUDENT', c.class_id, c.grade_level_id, FALSE
    FROM ${studying()}
    JOIN students s ON s.student_id = e.student_id
    JOIN classes c ON c.class_id = e.class_id
    UNION
    SELECT p.user_id, 'PARENT', c.class_id, c.grade_level_id, FALSE
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
       OR ${targetMatchSql(sp, matchGrade, matchClass)})`;
}

// The targeted half of audienceMatchSql (a whole-school post never passes it): ANY grade or class target matches.
function targetMatchSql(sp, matchGrade, matchClass) {
  return `(EXISTS (SELECT 1 FROM school_post_grade_targets vg
                  WHERE vg.school_post_id = ${sp}.school_post_id AND ${matchGrade('vg.grade_level_id')})
       OR EXISTS (SELECT 1 FROM school_post_class_targets vc
                  WHERE vc.school_post_id = ${sp}.school_post_id AND ${matchClass('vc.class_id')}))`;
}

/**
 * The role dimension (school_posts.target_roles, patch_v0.3_school_post_roles.sql), multiplied with the grade / class
 * one: NULL or empty = every role; otherwise the reader's role must be in the list. `role` is a SQL text expression
 * (the active role in UC-58 / UC-59, the role of each user_roles row in recipientsSql).
 */
const roleMatchSql = (sp, role) =>
  `(${sp}.target_roles IS NULL OR cardinality(${sp}.target_roles) = 0 OR ${role} = ANY(${sp}.target_roles))`;

/**
 * Decision 2 (FE-08 role audience, 09/11/2026, precedent business-rules §10 "homeroom teacher and creator always see
 * it"): the homeroom teacher of a class always gets a post TARGETED at that class or at its grade, even when the post
 * is for parents or students only. matchGrade / matchClass test the homeroom teacher's classes.
 * ASSUMPTION: only targeted posts. A whole-school post for some roles ("Toàn trường × Phụ huynh") is not "sent to
 * their class", so homeroom teachers get it only when TEACHER is one of its roles.
 */
const homeroomMatchSql = (sp, matchGrade, matchClass) => targetMatchSql(sp, matchGrade, matchClass);

// --- Who sees which post (business-rules §8, permissions.md "School post – View", note 8) ----------------------

/**
 * The audience the signed-in user belongs to, for the ACTIVE role only (business-rules §1, never the union).
 *   SCHOOL_MANAGER → { everyone: true }: every post, also those sent to a class they have nothing to do with.
 *   TEACHER / STUDENT / PARENT → their classes of the current school year and those classes' grades
 *   (classAudienceSql; "current school year" = FE-02 resolveSchoolYearId, business-rules §4 "School years").
 * System Admin sees no content (business-rules §1): the route refuses it; refused here too, so no caller can forget.
 * Nobody in a class (student not placed yet, parent with no linked child, no school year at all) → empty lists, which
 * still gives the whole-school posts. Not an error.
 * `role` is the active role, for school_posts.target_roles; homeroom* are the classes (and their grades) the user is
 * homeroom teacher of, under the TEACHER role only (decision 2, homeroomMatchSql).
 *
 * @returns {Promise<{ everyone: true } | { everyone: false, role: string, classIds: number[],
 *   gradeLevelIds: number[], homeroomClassIds: number[], homeroomGradeLevelIds: number[] }>}
 */
export async function resolveAudience({ userId, activeRole }, db = pool) {
  if (activeRole === 'SCHOOL_MANAGER') return { everyone: true };
  if (!READER_ROLES.includes(activeRole)) throw forbidden();

  const none = {
    everyone: false, role: activeRole, classIds: [], gradeLevelIds: [], homeroomClassIds: [], homeroomGradeLevelIds: [],
  };
  const yearId = await resolveSchoolYearId({}, db);
  if (!yearId) return none;

  const params = [yearId];
  const ca = classAudienceSql(params);
  params.push(userId, activeRole);
  const { rows } = await db.query(
    `SELECT DISTINCT ca.class_id AS "classId", ca.grade_level_id AS "gradeLevelId", ca.homeroom
     FROM ${ca} ca
     WHERE ca.user_id = $${params.length - 1} AND ca.role_code = $${params.length}`,
    params,
  );
  const homeroom = rows.filter((r) => r.homeroom);
  return {
    everyone: false,
    role: activeRole,
    classIds: [...new Set(rows.map((r) => r.classId))],
    gradeLevelIds: [...new Set(rows.map((r) => r.gradeLevelId))],
    homeroomClassIds: [...new Set(homeroom.map((r) => r.classId))],
    homeroomGradeLevelIds: [...new Set(homeroom.map((r) => r.gradeLevelId))],
  };
}

/**
 * THE visibility condition of school posts, used by UC-58 and UC-59 alike (one place, so the list and the detail
 * can never disagree). Includes "not deleted". Pushes its values onto params.
 * A Teacher / Student / Parent sees a post when (grade / class dimension) AND (role dimension), or – homeroom teacher
 * only – when it targets their homeroom class or its grade (decision 2). School Manager: every post not deleted.
 * MUST stay the same rule as recipientsSql (the notification and socket recipients).
 *
 * @param {Awaited<ReturnType<typeof resolveAudience>>} audience
 * @param {unknown[]} params
 * @param {string} sp alias of school_posts in the surrounding query
 */
export function visibleSchoolPostsSql(audience, params, sp = 'sp') {
  const notDeleted = `${sp}.deleted_at IS NULL`;
  if (audience.everyone) return notDeleted;
  const value = (v, type) => {
    params.push(v);
    return `$${params.length}::${type}`;
  };
  const grades = value(audience.gradeLevelIds, 'bigint[]');
  const classes = value(audience.classIds, 'bigint[]');
  const role = value(audience.role, 'text');
  const homeroomGrades = value(audience.homeroomGradeLevelIds, 'bigint[]');
  const homeroomClasses = value(audience.homeroomClassIds, 'bigint[]');
  return `${notDeleted} AND (
       (${audienceMatchSql(sp, (col) => `${col} = ANY(${grades})`, (col) => `${col} = ANY(${classes})`)}
        AND ${roleMatchSql(sp, role)})
       OR ${homeroomMatchSql(sp, (col) => `${col} = ANY(${homeroomGrades})`, (col) => `${col} = ANY(${homeroomClasses})`)})`;
}

/**
 * SELECT of the users who can see school post $postId – the same set as visibleSchoolPostsSql seen from the post's
 * side: a user is in it when ANY of their roles sees the post in UC-58 / UC-59 (one row per user, even with several
 * roles, as notification_recipients has PRIMARY KEY (notification_id, user_id)).
 *   - every School Manager (they see every post);
 *   - every Teacher / Student / Parent when the post has no target (whole school);
 *   - otherwise a Teacher / Student / Parent whose role is in a target class or in a class of a target grade
 *     (classAudienceSql + audienceMatchSql: the very rule UC-58 uses);
 *   - in both cases only when that role is in school_posts.target_roles (NULL / empty = every role, roleMatchSql);
 *   - and every homeroom teacher of a target class or of a class in a target grade, whatever the roles
 *     (homeroomMatchSql, decision 2).
 * The two branches are the two branches of visibleSchoolPostsSql, with the user's role instead of the active role.
 * System Admin is never in it (business-rules §1); SA is an exclusive role (§1), so an SA account has no other role.
 * ASSUMPTION: LOCKED accounts are included. Accounts are locked, never deleted (§3), so they find the notification
 * when they are unlocked; the bell is only read after signing in anyway.
 * params[0] MUST be the current school year (resolveSchoolYearId, may be null).
 */
function recipientsSql(params, postIdPlaceholder) {
  const ca = classAudienceSql(params);
  const inClassOf = (column) => (col) => `EXISTS (SELECT 1 FROM ca
                   WHERE ca.user_id = ur.user_id AND ca.role_code = r.role_code AND ca.${column} = ${col})`;
  const homeroomOf = (column) => (col) => `EXISTS (SELECT 1 FROM ca
                   WHERE ca.user_id = ur.user_id AND ca.role_code = r.role_code AND ca.homeroom AND ca.${column} = ${col})`;
  return `WITH ca AS ${ca}
     SELECT DISTINCT ur.user_id AS "userId"
     FROM user_roles ur
     JOIN roles r ON r.role_id = ur.role_id
     JOIN school_posts sp ON sp.school_post_id = ${postIdPlaceholder} AND sp.deleted_at IS NULL
     WHERE r.role_code = 'SCHOOL_MANAGER'
        OR (r.role_code IN ('TEACHER', 'STUDENT', 'PARENT')
            AND ${audienceMatchSql('sp', inClassOf('grade_level_id'), inClassOf('class_id'))}
            AND ${roleMatchSql('sp', 'r.role_code')})
        OR (r.role_code = 'TEACHER'
            AND ${homeroomMatchSql('sp', homeroomOf('grade_level_id'), homeroomOf('class_id'))})`;
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
export function countSchoolPostLikes(schoolPostIds, userId, db = pool) {
  return feed.countLikes(SCHOOL_POST, schoolPostIds, userId, db);
}

/**
 * Comments per school post (not deleted, replies included): Map id → commentCount. ANNOUNCEMENT ids only (§8).
 * ASSUMPTION: a reply whose parent comment was deleted still counts; it is deleted only when it is deleted itself
 * (it is still shown under the "Bình luận đã bị xoá" placeholder of UC-65).
 */
export function countSchoolPostComments(schoolPostIds, db = pool) {
  return feed.countComments(SCHOOL_POST, schoolPostIds, db);
}

const SCHOOL_POST = feed.FEED_COLUMNS.SCHOOL_POST; // the column of school posts in post_likes / comments

// The column of school posts in attachments (utils/attachments.js target).
const ATTACHMENT_COLUMN = files.ATTACHMENT_COLUMNS.SCHOOL_POST;
const attachmentTarget = (schoolPostId) => ({ column: ATTACHMENT_COLUMN, id: schoolPostId });

// Runs fn over items with at most `limit` at the same time (signing calls Supabase over HTTP, not the DB pool).
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Attachments per school post for the UC-58 cards: Map id → { attachmentCount, firstImageUrl }.
 * TWO queries for the whole page, whatever its size (DB_POOL_MAX=3): the counts (shared countAttachments) and the
 * first image of each post (DISTINCT ON). Only that first image is signed – one link per card, never every file – and
 * the signing is an HTTP call to Supabase Storage, not a DB query (at most 6 at a time). A link that cannot be signed
 * (object missing, Storage down) gives null: the card simply shows no picture. A row kept on local disk (no
 * storage_key) gives its file_url as before.
 */
async function summarizeAttachments(schoolPostIds, db = pool) {
  if (!schoolPostIds.length) return new Map();
  const counts = await files.countAttachments(ATTACHMENT_COLUMN, schoolPostIds, db);
  if (!counts.size) return new Map();
  const { rows } = await db.query(
    `SELECT DISTINCT ON (school_post_id) school_post_id AS "schoolPostId", file_url AS "fileUrl",
            storage_key AS "storageKey", bucket
     FROM attachments
     WHERE school_post_id = ANY($1::bigint[]) AND deleted_at IS NULL AND mime_type LIKE 'image/%'
     ORDER BY school_post_id, attachment_id`,
    [[...counts.keys()]],
  );
  const firstImages = new Map(
    await mapLimit(rows, 6, async ({ schoolPostId, fileUrl, storageKey, bucket }) => {
      if (!storageKey) return [schoolPostId, fileUrl];
      try {
        return [schoolPostId, await signedUrl(bucket, storageKey)];
      } catch (err) {
        console.error(`[schoolposts] first image of post ${schoolPostId} not signed: ${err.message}`);
        return [schoolPostId, null];
      }
    }),
  );
  return new Map(
    [...counts].map(([id, attachmentCount]) => [id, { attachmentCount, firstImageUrl: firstImages.get(id) ?? null }]),
  );
}

// --- Attachments of UC-60 / UC-61 ----------------------------------------------------------------------------------

// ASSUMPTION: at most 10 files per school post (business-rules §5 sets sizes, not a number). Ten files of up to
// 10 MB (videos 50 MB) already make a heavy post on a phone, and the Free plan has 5 GB of egress a month.
export const MAX_ATTACHMENTS = 10;

/** What the SCR-31 / SCR-06 file picker must respect, read from system_settings at each call (never hard-coded). */
export async function getAttachmentLimits() {
  return {
    maxFiles: MAX_ATTACHMENTS,
    maxFileMb: await getNumberSetting('upload.max_file_mb', 10),
    maxVideoMb: await getNumberSetting('upload.max_video_mb', 50),
    types: Object.entries(ATTACHMENT_TYPES).map(([mimeType, rule]) => ({
      mimeType,
      kind: rule.kind,
      extensions: rule.ext,
    })),
  };
}

/**
 * The files of a UC-60 / UC-61 body (already shaped by the controller: storageKey in school-posts/, the attachments
 * bucket, a file name), checked against the bucket BEFORE the transaction (HTTP calls must not hold a DB connection
 * and a lock): each object must exist, and its REAL size and type are written, never the numbers of the body
 * (they come from the client; /uploads/confirm checked the object itself, these values are its result).
 * insertAttachments then refuses a key that is still in tmp/ or belongs to another feature, and a file already
 * attached somewhere (409).
 */
async function readAttachments(list) {
  return mapLimit(list, 4, async ({ storageKey, bucket, fileName }) => {
    const info = await objectInfo(bucket, storageKey);
    if (!info) {
      throw badRequest('MSG_UPLOAD_FAILED', 'An attached file was not found. Please upload it again.', { storageKey });
    }
    return { storageKey, bucket, fileName, mimeType: info.mimeType, sizeBytes: info.size };
  });
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

// school_posts.target_roles for the API: always an array, [] = every role (NULL in the DB), in the order of
// TARGETABLE_ROLES (the controller writes the column in that order). audienceType stays about grades / classes only.
const TARGET_ROLES = (sp) => `COALESCE(${sp}.target_roles, '{}')::text[]`;

/** Roles a school post can be sent to (school_posts.target_roles CHECK), in display order. */
export const TARGETABLE_ROLES = ['STUDENT', 'PARENT', 'TEACHER'];
// The value written to school_posts.target_roles: NULL for every role (the controller passes [] then).
const rolesColumn = (roles) => (roles.length ? roles : null);
const sameRoles = (a, b) => a.join() === b.join(); // both in TARGETABLE_ROLES order

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
            ${AUDIENCE_TYPE('sp')} AS "audienceType", ${TARGET_ROLES('sp')} AS "targetRoles"
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
  const items = posts.map(({ targetRoles, ...post }) => {
    const t = targets.get(post.schoolPostId);
    return {
      ...post,
      // ASSUMPTION: returned to every role, not only School Manager: grade and class names are not personal data
      // and tell the reader why they get the post ("Khối 10", "11D1"). null for a whole-school post for every role
      // (as before the role dimension); a whole-school post for some roles gets empty names and its targetRoles
      // ("Toàn trường · Giáo viên"). targetRoles [] = every role. The client writes the Vietnamese words.
      audienceSummary: post.audienceType === 'SCHOOL' && !targetRoles.length ? null : {
        gradeLevelNames: t?.gradeTargets.map((g) => g.gradeLevelName) ?? [],
        classNames: t?.classTargets.map((c) => c.className) ?? [],
        targetRoles,
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
 * Comments themselves are listed by UC-65 (listSchoolPostComments); only commentCount here.
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
            ${AUDIENCE_TYPE('sp')} AS "audienceType", ${TARGET_ROLES('sp')} AS "targetRoles"
     FROM school_posts sp
     JOIN users u ON u.user_id = sp.author_id
     WHERE sp.school_post_id = $1 AND ${visibleSchoolPostsSql(audience, params)}`,
    params,
  );
  const post = rows[0];
  if (!post) throw schoolPostNotFound();

  const interactions = await interactionsOf([post], user.userId, db);
  const targets = (await findTargets([post.schoolPostId], db)).get(post.schoolPostId);
  // Read only AFTER the visibility check above: a reader outside the audience gets the 404 and no link at all.
  // Each url is signed now from the row's storage_key (private bucket, 1 hour); null when it cannot be signed.
  const attachments = await files.listAttachments(attachmentTarget(post.schoolPostId), db);
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
// Used by UC-60 and by UC-61 when the audience changes (see updateSchoolPost).
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
 * { title, content, postType, sendNotification?, gradeLevelIds, classIds, targetRoles } (ids de-duplicated;
 * targetRoles checked, de-duplicated and in TARGETABLE_ROLES order, [] = every role → stored as NULL).
 * - sendNotification left out → the default of the type (§8; schema comment): ANNOUNCEMENT true, NEWS false.
 * - ANNOUNCEMENT needs at least one grade or class (§8); NEWS may have targets or none (none = whole school).
 *   Roles do not count for that rule: "Toàn trường × Giáo viên" is sent as NEWS, or as an ANNOUNCEMENT to every grade.
 * - Not pinned (UC-63 pins). Post, targets, attachments and notification are written together or not at all.
 * - attachments: what /uploads/confirm returned (controller: at most MAX_ATTACHMENTS, keys in school-posts/). Their
 *   objects are checked before the transaction (readAttachments); the rows are inserted in it, in the order sent, by
 *   the shared insertAttachments. NEWS and ANNOUNCEMENT alike (§5 / §8 do not tell them apart here).
 */
export async function createSchoolPost(user, input) {
  const { title, content, postType, gradeLevelIds, classIds, targetRoles = [], attachments = [] } = input;
  if (postType === 'ANNOUNCEMENT' && !gradeLevelIds.length && !classIds.length) {
    throw badRequest('MSG_AUDIENCE_REQUIRED', 'An announcement needs at least one grade level or class.',
      { fields: ['gradeLevelIds', 'classIds'] });
  }
  const sendNotification = input.sendNotification ?? postType === 'ANNOUNCEMENT';
  const fileRows = await readAttachments(attachments);

  const result = await withTransaction(async (client) => {
    await checkTargets(client, { gradeLevelIds, classIds });
    const { rows } = await client.query(
      `INSERT INTO school_posts (author_id, title, content, post_type, send_notification, is_pinned, target_roles,
                                 created_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6::varchar(20)[], NOW())
       RETURNING school_post_id AS "schoolPostId"`,
      [user.userId, title, content, postType, sendNotification, rolesColumn(targetRoles)],
    );
    const { schoolPostId } = rows[0];
    await saveTargets(client, schoolPostId, { gradeLevelIds, classIds });
    if (fileRows.length) {
      await files.insertAttachments(
        attachmentTarget(schoolPostId),
        fileRows.map((row) => ({ ...row, uploadedBy: user.userId })),
        client,
      );
    }
    if (sendNotification) await notifySchoolPost(client, { schoolPostId, title, createdBy: user.userId });
    return getSchoolPost(user, schoolPostId, client);
  });
  publishSchoolPostChanged(result.post.schoolPostId, 'created'); // after COMMIT, not awaited
  return result;
}

// Locks a post that is not deleted (two School Managers saving at once are applied one after the other), or 404.
async function lockSchoolPost(client, schoolPostId) {
  const { rows } = await client.query(
    `SELECT school_post_id AS "schoolPostId", post_type AS "postType", ${TARGET_ROLES('school_posts')} AS "targetRoles"
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

// The target ids a post has now, sorted (UC-61 compares them with the new ones).
async function currentTargetIds(client, schoolPostId) {
  const { rows: grades } = await client.query(
    'SELECT grade_level_id AS id FROM school_post_grade_targets WHERE school_post_id = $1 ORDER BY 1',
    [schoolPostId],
  );
  const { rows: classes } = await client.query(
    'SELECT class_id AS id FROM school_post_class_targets WHERE school_post_id = $1 ORDER BY 1',
    [schoolPostId],
  );
  return { gradeLevelIds: grades.map((r) => r.id), classIds: classes.map((r) => r.id) };
}

const sameIds = (a, b) => {
  const sorted = [...b].sort((x, y) => x - y);
  return a.length === sorted.length && a.every((id, i) => id === sorted[i]);
};

/**
 * UC-61 Update School Post (SCR-06). changes = { title?, content?, audience?, targetRoles? } (validated by the
 * controller; audience = { gradeLevelIds, classIds }, de-duplicated; targetRoles as in UC-60, [] = every role).
 * - targetRoles: the role dimension of the audience, changed on its own (left out = kept). A real change is treated
 *   like a target change: recipients before (in the lock) and after (after COMMIT) both get "schoolpost:changed",
 *   updated_at moves, no new notification.
 * - title / content: written only when a value really differs (IS DISTINCT FROM, as UC-09).
 * - audience (lead OK 07/11/2026): replaces ALL the targets of the post. The target rows are HARD deleted and written
 *   again in this transaction (school_post_grade_targets / school_post_class_targets are join tables, like
 *   student_parents; the proposal to add them to business-rules §14 is with the lead). Same set as now → no write.
 *   ANNOUNCEMENT must keep at least one target (§8) → 400 MSG_AUDIENCE_REQUIRED; NEWS with none = whole school.
 * - attachments (new files, as in UC-60) / removeAttachmentIds (files of this post to take off): changeAttachments.
 *   Taking a file off soft deletes its row; the object stays in the bucket.
 * Something really changed → updated_at = NOW() (no trigger on school_posts). Nothing changed → still 200.
 * ASSUMPTION: an update sends no new notification (§8 does not say so; one per typo fix would be noise).
 * ASSUMPTION: also when the audience changes, people who are new in it get NO notification: the post's notification
 * row was sent once, and sending again would notify twice the people who were already in it. To confirm with the lead.
 * ASSUMPTION: likes and comments written by people who are no longer in the audience stay (and still count).
 * Refused by the controller: postType (ANNOUNCEMENT ↔ NEWS changes likes, comments, pinning and the notification
 * already sent – the lead said no 07/11) and sendNotification (sent, or not, when the post was created).
 */
export async function updateSchoolPost(user, schoolPostId, changes) {
  // Real time: who could see the post BEFORE an audience change (they must hear that it left their screen).
  let before = [];
  let anythingChanged = false;
  // New files are checked against the bucket before the lock (HTTP, see readAttachments).
  const addRows = await readAttachments(changes.attachments ?? []);
  const result = await withTransaction(async (client) => {
    const post = await lockSchoolPost(client, schoolPostId);
    let changed = await changeAttachments(client, user, schoolPostId, {
      add: addRows,
      removeIds: changes.removeAttachmentIds ?? [],
    });

    const { audience, targetRoles } = changes;
    let targetsChanged = false;
    if (audience) {
      if (post.postType === 'ANNOUNCEMENT' && !audience.gradeLevelIds.length && !audience.classIds.length) {
        throw badRequest('MSG_AUDIENCE_REQUIRED', 'An announcement needs at least one grade level or class.',
          { fields: ['gradeLevelIds', 'classIds'] });
      }
      const now = await currentTargetIds(client, schoolPostId);
      targetsChanged = !sameIds(now.gradeLevelIds, audience.gradeLevelIds) || !sameIds(now.classIds, audience.classIds);
      if (targetsChanged) await checkTargets(client, audience);
    }
    // The roles are the other dimension of the same audience: a change is handled exactly like a target change.
    const rolesChanged = targetRoles !== undefined && !sameRoles(post.targetRoles, targetRoles);

    if (targetsChanged || rolesChanged) {
      // Read with the old audience, inside the lock (only when the audience really changes: rare, and the query is
      // the heavy one of the notifications, so it is not run for a title fix).
      before = await recipientsOfSchoolPost(schoolPostId, client);
      if (targetsChanged) {
        await client.query('DELETE FROM school_post_grade_targets WHERE school_post_id = $1', [schoolPostId]);
        await client.query('DELETE FROM school_post_class_targets WHERE school_post_id = $1', [schoolPostId]);
        await saveTargets(client, schoolPostId, audience);
      }
      changed = true;
    }

    const params = [schoolPostId];
    const sets = [];
    const differs = [];
    for (const [field, column] of Object.entries(EDITABLE_COLUMNS)) {
      if (!Object.hasOwn(changes, field)) continue;
      params.push(changes[field]);
      sets.push(`${column} = $${params.length}`);
      differs.push(`${column} IS DISTINCT FROM $${params.length}`);
    }
    if (rolesChanged) {
      params.push(rolesColumn(targetRoles));
      sets.push(`target_roles = $${params.length}::varchar(20)[]`);
    }
    if (sets.length || changed) {
      // With an audience change updated_at moves even when title / content stay the same.
      const condition = changed ? 'TRUE' : differs.join(' OR ');
      const { rowCount } = await client.query(
        `UPDATE school_posts SET ${[...sets, 'updated_at = NOW()'].join(', ')}
         WHERE school_post_id = $1 AND (${condition})`,
        params,
      );
      anythingChanged = rowCount > 0;
    }
    return getSchoolPost(user, schoolPostId, client);
  });
  // After COMMIT, not awaited; nothing really changed (same values) → no signal.
  if (anythingChanged) publishSchoolPostChanged(result.post.schoolPostId, 'updated', { before });
  return result;
}

/**
 * UC-61 attachments, inside the post's lock: removeIds are SOFT deleted (§14, deleted_at; the objects stay in the
 * bucket, nobody gets a link to them any more), then `add` is inserted by the shared insertAttachments.
 * - removeIds must be attachments of THIS post (another post's id → 400, nothing written); one already deleted (two
 *   School Managers at once) is skipped.
 * - The post may not end with more than MAX_ATTACHMENTS files → 400 MSG_TOO_MANY_ATTACHMENTS { max }.
 * ASSUMPTION: rows are soft deleted one by one here because the shared softDeleteAttachments removes ALL the files of
 * a post (UC-62). Proposed to move into utils/attachments.js as a shared function (FE-05 needs the same for edits).
 * @returns {Promise<boolean>} true when a row was added or removed
 */
async function changeAttachments(client, user, schoolPostId, { add, removeIds }) {
  if (!add.length && !removeIds.length) return false;
  const { rows } = await client.query(
    `SELECT attachment_id AS id, deleted_at IS NOT NULL AS "isDeleted"
     FROM attachments WHERE school_post_id = $1
     FOR UPDATE`,
    [schoolPostId],
  );
  const ofPost = new Map(rows.map((r) => [r.id, r.isDeleted]));
  const foreign = removeIds.filter((id) => !ofPost.has(id));
  if (foreign.length) {
    throw badRequest('MSG_INVALID_PARAM', 'These files are not attached to this post.',
      { field: 'removeAttachmentIds', attachmentIds: foreign });
  }
  const removing = removeIds.filter((id) => ofPost.get(id) === false);
  const kept = rows.filter((r) => !r.isDeleted).length - removing.length;
  if (kept + add.length > MAX_ATTACHMENTS) {
    throw badRequest('MSG_TOO_MANY_ATTACHMENTS', `A school post can have at most ${MAX_ATTACHMENTS} files.`,
      { max: MAX_ATTACHMENTS });
  }
  if (removing.length) {
    await client.query(
      `UPDATE attachments SET deleted_at = NOW()
       WHERE school_post_id = $1 AND attachment_id = ANY($2::bigint[]) AND deleted_at IS NULL`,
      [schoolPostId, removing],
    );
  }
  if (add.length) {
    await files.insertAttachments(attachmentTarget(schoolPostId), add.map((r) => ({ ...r, uploadedBy: user.userId })), client);
  }
  return removing.length > 0 || add.length > 0;
}

/**
 * UC-62 Delete School Post: soft delete (business-rules §14), deleted_at = NOW(), deleted_by = the School Manager.
 * Its attachments are soft deleted with it (shared softDeleteAttachments, same transaction); the objects stay in the
 * bucket. Comments, likes and the notification already sent stay as they are; the post simply no longer shows
 * (every read filters deleted_at). Already deleted → 404.
 * Returns the UC-59 object as it was just before the delete (read inside the transaction; afterwards UC-59 gives 404).
 */
export async function deleteSchoolPost(user, schoolPostId) {
  let before = [];
  const result = await withTransaction(async (client) => {
    await lockSchoolPost(client, schoolPostId);
    const current = await getSchoolPost(user, schoolPostId, client);
    // Real time: recipientsSql only sees posts not deleted, so the readers are listed BEFORE the soft delete.
    before = await recipientsOfSchoolPost(schoolPostId, client);
    await client.query(
      'UPDATE school_posts SET deleted_at = NOW(), deleted_by = $2 WHERE school_post_id = $1 AND deleted_at IS NULL',
      [schoolPostId, user.userId],
    );
    await files.softDeleteAttachments(attachmentTarget(schoolPostId), client);
    return current;
  });
  publishSchoolPostChanged(result.post.schoolPostId, 'deleted', { before, readNow: false }); // after COMMIT
  return result;
}

/**
 * UC-63 Pin / Unpin School Post. Only announcements can be pinned (§8): pinning NEWS → 400 MSG_CANNOT_PIN_NEWS.
 * No limit on how many posts are pinned at once (§8 sets none). Same value as now → no write, still 200.
 * ASSUMPTION: unpinning NEWS (isPinned false) is accepted as a no-op, since NEWS is never pinned.
 * ASSUMPTION: pinning is not an edit of the post, so updated_at is not touched.
 */
export async function pinSchoolPost(user, schoolPostId, isPinned) {
  let changed = false;
  const result = await withTransaction(async (client) => {
    const post = await lockSchoolPost(client, schoolPostId);
    if (isPinned && post.postType !== 'ANNOUNCEMENT') {
      throw badRequest('MSG_CANNOT_PIN_NEWS', 'Only announcements can be pinned.', { field: 'isPinned' });
    }
    const { rowCount } = await client.query(
      'UPDATE school_posts SET is_pinned = $2 WHERE school_post_id = $1 AND is_pinned IS DISTINCT FROM $2',
      [schoolPostId, isPinned],
    );
    changed = rowCount > 0;
    return getSchoolPost(user, schoolPostId, client);
  });
  // After COMMIT, not awaited; pinning what is already pinned (or unpinning NEWS) changes nothing → no signal.
  if (changed) publishSchoolPostChanged(result.post.schoolPostId, isPinned ? 'pinned' : 'unpinned');
  return result;
}

// --- UC-64..UC-66 Like and comment (SCR-05) ----------------------------------------------------------------------
// permissions.md "School post (announcement) – React / comment": School Manager Full, Teacher / Student / Parent
// Restricted (15) = within the audience, news view only. "School post comment – Delete": School Manager Full (UC-66),
// the others Restricted (17) = own comments only. System Admin: refused by the route and by resolveAudience (§1).
// The rows are read and written by utils/feedInteractions.js; the checks of the school feed are made here, first.
// Not logged (business-rules §13 does not list them). Real time: comments only, see "Real-time signals" below.

/**
 * The post the user wants to interact with, read with UC-59's visibility rule (visibleSchoolPostsSql): it does not
 * exist, is deleted or is not addressed to the user → 404 MSG_SCHOOL_POST_NOT_FOUND (same answer, so nobody learns a
 * post outside their audience exists). Writes pass lock: the row is read FOR SHARE, so UC-61 / UC-62 (FOR UPDATE)
 * wait until the transaction ends: nobody likes or comments a post that is being deleted or moved to another audience
 * at the same moment.
 */
async function openSchoolPostForInteraction(client, user, schoolPostId, { lock = false } = {}) {
  const audience = await resolveAudience(user, client);
  const params = [schoolPostId];
  const { rows } = await client.query(
    `SELECT sp.school_post_id AS "schoolPostId", sp.post_type AS "postType"
     FROM school_posts sp
     WHERE sp.school_post_id = $1 AND ${visibleSchoolPostsSql(audience, params)}
     ${lock ? 'FOR SHARE' : ''}`,
    params,
  );
  if (!rows[0]) throw schoolPostNotFound();
  return { ...rows[0], target: { column: SCHOOL_POST, id: rows[0].schoolPostId } };
}

/**
 * Socket room check of "schoolpost:join" (sockets/index.js): may this user, under the active role of their token, see
 * the post? Exactly UC-59's rule (openSchoolPostForInteraction: resolveAudience + visibleSchoolPostsSql, no lock, no
 * transaction) – 2 short queries for a Teacher / Student / Parent (current year, their classes) plus the post row;
 * 1 for a School Manager. Throws 404 MSG_SCHOOL_POST_NOT_FOUND / 403 like the API; returns nothing.
 */
export async function assertCanSeeSchoolPost(user, schoolPostId) {
  await openSchoolPostForInteraction(pool, user, schoolPostId);
}

// --- Real-time signals (FE-08, approved by Quoc 09/11/2026) ------------------------------------------------------
// Ids only, never content: the client reloads through this API, which checks the active role again (the socket room
// "user:<id>" follows the person, not the role). Always sent AFTER the transaction committed (a signal before COMMIT
// could make the client read old data, or announce a write that is then rolled back), and fire-and-forget: an error
// while sending is logged, it never turns a saved write into a 500. No event for likes (UC-64): a heavy recipient
// query after every click would take the 3-connection pool the chat uses; the client keeps its optimistic count.
//
//   schoolpost:changed          → emitToUsers(every user who can see the post, any of their roles)
//                                 { schoolPostId, change: 'created' | 'updated' | 'deleted' | 'pinned' | 'unpinned' }
//   schoolpost:comment          → room "schoolpost:<id>"  { schoolPostId, commentId, parentCommentId, authorId }
//   schoolpost:comment-deleted  → room "schoolpost:<id>"  { schoolPostId, commentId }

function sendSafely(label, send) {
  try {
    Promise.resolve(send()).catch((err) => console.error(`[schoolposts] ${label} not sent:`, err?.message));
  } catch (err) {
    console.error(`[schoolposts] ${label} not sent:`, err?.message);
  }
}

/**
 * "schoolpost:changed" to everyone who can see the post now (recipientsOfSchoolPost, read after the commit) plus
 * `before`: the people who could see it before the change (UC-61 audience change: those who lost it must hear too;
 * UC-62: the post is deleted, so recipientsOfSchoolPost would find nobody – the list is read before the delete and
 * `readNow` is false). The caller does not wait.
 */
function publishSchoolPostChanged(schoolPostId, change, { before = [], readNow = true } = {}) {
  sendSafely(`schoolpost:changed ${change} #${schoolPostId}`, async () => {
    const now = readNow ? await recipientsOfSchoolPost(schoolPostId) : [];
    emitToUsers([...before, ...now], 'schoolpost:changed', { schoolPostId, change });
  });
}

// Only announcements can be liked and commented on; NEWS is view only (business-rules §8). Checked on the server even
// though UC-59 gives the client canInteract.
function assertAnnouncement(post, code, message) {
  if (post.postType !== 'ANNOUNCEMENT') throw badRequest(code, message);
}

/**
 * UC-64 React to School Post: like (liked = true) or unlike (false). Only Like exists (§5). Both are idempotent:
 * liking twice or unliking a post one did not like is 200 and changes nothing (PUT / DELETE, not a toggle, so a double
 * click never undoes itself). Unlike HARD deletes the post_likes row (§14). NEWS → 400 MSG_CANNOT_REACT_NEWS.
 * @returns {Promise<{ likeCount: number, likedByMe: boolean }>} the same numbers UC-58 / UC-59 show
 */
export async function setSchoolPostLike(user, schoolPostId, liked) {
  return withTransaction(async (client) => {
    const post = await openSchoolPostForInteraction(client, user, schoolPostId, { lock: true });
    assertAnnouncement(post, 'MSG_CANNOT_REACT_NEWS', 'News posts cannot be liked.');
    if (liked) await feed.addLike(post.target, user.userId, client);
    else await feed.removeLike(post.target, user.userId, client);
    return feed.likeSummary(post.target, user.userId, client);
  });
}

// permissions.md note 17 / UC-66: School Manager deletes any comment; everyone else only their own.
const mayDeleteComment = (user) => (comment) =>
  user.activeRole === 'SCHOOL_MANAGER' || comment.authorId === user.userId;

/**
 * UC-65 (reading): one page of the comments of an announcement, as a tree paged by top-level comment (see
 * feed.listComments: every reply comes with its top-level comment; deleted comments with a visible reply stay as a
 * placeholder). canDelete follows UC-66. NEWS → an empty page, not an error (it has no comments to show).
 * commentCount = the post's count in UC-58 / UC-59, so the client can refresh it.
 */
export async function listSchoolPostComments(user, schoolPostId, { page, pageSize }) {
  // A read: no transaction, no lock (one query after the other, DB_POOL_MAX=3 on the shared pooler).
  const post = await openSchoolPostForInteraction(pool, user, schoolPostId);
  if (post.postType !== 'ANNOUNCEMENT') return { items: [], page, pageSize, total: 0, commentCount: 0 };
  const result = await feed.listComments(post.target, { page, pageSize, canDelete: mayDeleteComment(user) });
  return { ...result, commentCount: await commentCountOf(post.schoolPostId) };
}

/**
 * UC-65 Comment on School Post: a comment, or a reply when parentCommentId is given (any level, §5). The parent must
 * be a comment of THIS post (400 MSG_INVALID_PARENT_COMMENT) and not deleted (409 MSG_PARENT_COMMENT_DELETED).
 * NEWS → 400 MSG_CANNOT_COMMENT_NEWS. Returns the new comment (canDelete true: it is the user's own).
 */
export async function createSchoolPostComment(user, schoolPostId, { content, parentCommentId }) {
  const comment = await withTransaction(async (client) => {
    const post = await openSchoolPostForInteraction(client, user, schoolPostId, { lock: true });
    assertAnnouncement(post, 'MSG_CANNOT_COMMENT_NEWS', 'News posts cannot be commented on.');
    const row = await feed.insertComment(post.target, { authorId: user.userId, content, parentCommentId }, client);
    return { ...row, canDelete: true };
  });
  // After COMMIT; only ANNOUNCEMENT gets here (NEWS refused above). authorId lets the author's tab skip its own echo.
  sendSafely(`schoolpost:comment #${schoolPostId}`, () =>
    emitToSchoolPost(Number(schoolPostId), 'schoolpost:comment', {
      schoolPostId: Number(schoolPostId),
      commentId: comment.commentId,
      parentCommentId: comment.parentCommentId,
      authorId: comment.authorId,
    }),
  );
  return comment;
}

// The post's commentCount exactly as UC-58 / UC-59 show it.
const commentCountOf = async (schoolPostId, db = pool) =>
  (await countSchoolPostComments([schoolPostId], db)).get(schoolPostId) ?? 0;

const commentNotFound = () => notFound('MSG_COMMENT_NOT_FOUND', 'The comment was not found.');

/**
 * UC-66 Delete School Post Comment: SOFT delete (deleted_at = NOW(), deleted_by = user; §5 "deleted, never hidden").
 * School Manager: any comment (UC-66); Teacher / Student / Parent: their own only (permissions.md note 17) → else 403.
 * The comment does not exist, belongs to another post or is already deleted → 404 MSG_COMMENT_NOT_FOUND (checked
 * before the permission: a comment that is gone is gone for everyone). Its replies stay.
 * ASSUMPTION: on a NEWS post the comments do not exist for the API (UC-65 shows none), so deleting one is 404 too.
 * ASSUMPTION: a user who left the post's audience can no longer delete their old comment there (they no longer see
 * the post: 404). A School Manager still can.
 */
export async function deleteSchoolPostComment(user, schoolPostId, commentId) {
  const result = await withTransaction(async (client) => {
    const post = await openSchoolPostForInteraction(client, user, schoolPostId, { lock: true });
    if (post.postType !== 'ANNOUNCEMENT') throw commentNotFound();
    const comment = await feed.findComment(post.target, commentId, { forUpdate: true }, client);
    if (!comment || comment.isDeleted) throw commentNotFound();
    if (!mayDeleteComment(user)(comment)) {
      throw forbidden('FORBIDDEN', 'You can only delete your own comments.');
    }
    await feed.softDeleteComment(post.target, commentId, user.userId, client);
    return { commentId, isDeleted: true, commentCount: await commentCountOf(post.schoolPostId, client) };
  });
  sendSafely(`schoolpost:comment-deleted #${schoolPostId}`, () =>
    emitToSchoolPost(Number(schoolPostId), 'schoolpost:comment-deleted', {
      schoolPostId: Number(schoolPostId),
      commentId: result.commentId,
    }),
  );
  return result;
}
