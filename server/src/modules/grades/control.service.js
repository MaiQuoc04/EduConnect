import { pool, withTransaction } from '../../config/db.js';
import { logActivity } from '../../utils/activityLog.js';
import { badRequest } from '../../utils/AppError.js';
import { containsPattern, VI_TRANSLATE } from '../../utils/search.js';
import { loadBookKey } from './gradebook.service.js';
import { bookStatus, conflict, loadSemester, lockBookForWrite, parseId, teacherIdOf } from './grades.scope.js';

// FE-11 (owner: Linh) – Grade Control (SCR-68): UC-86 Unlock Grades and UC-87 View Grade Change History (School
// Manager), plus the lists of grade books for the School Manager and for a teacher (SCR-44).

const HISTORY_PAGE_SIZE = 50;
const STATUSES = ['OPEN', 'LOCKED', 'UNLOCKED'];

// Grade books of a semester = every class × subject with a teaching assignment in the semester's school year, plus
// any book that already has a lock row. Status OPEN = never finalized.
const BOOKS_SQL = `
  WITH books AS (
    SELECT DISTINCT ta.class_id, ta.subject_id FROM teaching_assignments ta
    JOIN classes c ON c.class_id = ta.class_id
    WHERE ta.deleted_at IS NULL AND c.deleted_at IS NULL AND c.school_year_id = $2
    UNION
    SELECT l.class_id, l.subject_id FROM grade_locks l WHERE l.semester_id = $1
  )
  SELECT c.class_id AS "classId", c.class_name AS "className", g.grade_level_name AS "gradeLevelName",
         s.subject_id AS "subjectId", s.subject_name AS "subjectName",
         COALESCE(l.status, 'OPEN') AS status, l.locked_at AS "lockedAt", lu.full_name AS "lockedBy",
         l.unlocked_at AS "unlockedAt", uu.full_name AS "unlockedBy",
         (SELECT string_agg(DISTINCT tu.full_name, ', ') FROM teaching_assignments ta
          JOIN teachers t ON t.teacher_id = ta.teacher_id JOIN users tu ON tu.user_id = t.user_id
          WHERE ta.class_id = b.class_id AND ta.subject_id = b.subject_id AND ta.deleted_at IS NULL
            AND ta.end_date >= CURRENT_DATE) AS "teachers",
         EXISTS (SELECT 1 FROM grade_components gc WHERE gc.subject_id = b.subject_id
                 AND gc.grade_level_id = c.grade_level_id AND gc.semester_id = $1) AS "hasStructure"
  FROM books b
  JOIN classes c ON c.class_id = b.class_id
  JOIN grade_levels g ON g.grade_level_id = c.grade_level_id
  JOIN subjects s ON s.subject_id = b.subject_id
  LEFT JOIN grade_locks l ON l.class_id = b.class_id AND l.subject_id = b.subject_id AND l.semester_id = $1
  LEFT JOIN users lu ON lu.user_id = l.locked_by
  LEFT JOIN users uu ON uu.user_id = l.unlocked_by`;

// SCR-68 list (School Manager): filters class, subject, status.
export async function listBooks(query) {
  const semester = await loadSemester(pool, query.semesterId);
  const classId = query.classId ? parseId(query.classId) : null;
  const subjectId = query.subjectId ? parseId(query.subjectId) : null;
  const status = STATUSES.includes(query.status) ? query.status : null;
  const { rows } = await pool.query(
    `SELECT * FROM (${BOOKS_SQL}) x
     WHERE ($3::bigint IS NULL OR x."classId" = $3) AND ($4::bigint IS NULL OR x."subjectId" = $4)
       AND ($5::text IS NULL OR x.status = $5)
     ORDER BY x."gradeLevelName", x."className", x."subjectName" COLLATE "vi-VN-x-icu"`,
    [semester.semesterId, semester.schoolYearId, classId, subjectId, status],
  );
  return { semester, items: rows };
}

// SCR-44 list (teacher): the books the teacher may enter now (current or future assignment) in the semester's year.
export async function myBooks(query, user) {
  const semester = await loadSemester(pool, query.semesterId);
  const teacherId = await teacherIdOf(pool, user.userId);
  const { rows } = await pool.query(
    `SELECT * FROM (${BOOKS_SQL}) x
     WHERE EXISTS (SELECT 1 FROM teaching_assignments ta
                   WHERE ta.class_id = x."classId" AND ta.subject_id = x."subjectId" AND ta.teacher_id = $3
                     AND ta.deleted_at IS NULL AND ta.end_date >= CURRENT_DATE)
     ORDER BY x."gradeLevelName", x."className", x."subjectName" COLLATE "vi-VN-x-icu"`,
    [semester.semesterId, semester.schoolYearId, teacherId ?? 0],
  );
  return { semester, items: rows };
}

// UC-86 Unlock Grades: a finalized book becomes editable again; logged as GRADE_UNLOCK (business-rules §13).
// ASSUMPTION (FE-11 owner, 10/11/2026): an optional reason (≤ 255 characters) goes into the log; the teacher is not
// notified (they asked the School Manager outside the system, business-rules §11).
export async function unlockBook(params, body, user, ip) {
  const { cls, subject, semester } = await loadBookKey(pool, params);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > 255) throw badRequest('MSG_REASON_TOO_LONG', 'The reason must be at most 255 characters.');
  const lockId = await withTransaction(async (client) => {
    await lockBookForWrite(client, cls.classId, subject.subjectId, semester.semesterId);
    if ((await bookStatus(client, cls.classId, subject.subjectId, semester.semesterId)) !== 'LOCKED') {
      throw conflict('MSG_GRADES_NOT_FINALIZED', 'These grades are not finalized.');
    }
    const { rows } = await client.query(
      `UPDATE grade_locks SET status = 'UNLOCKED', unlocked_by = $4, unlocked_at = NOW()
       WHERE class_id = $1 AND subject_id = $2 AND semester_id = $3 RETURNING lock_id`,
      [cls.classId, subject.subjectId, semester.semesterId, user.userId],
    );
    return rows[0].lock_id;
  });
  await logActivity({
    userId: user.userId,
    action: 'GRADE_UNLOCK',
    targetType: 'GRADE_BOOK',
    targetId: lockId,
    detail: {
      className: cls.className,
      subject: subject.subjectName,
      semester: semester.semesterNo,
      year: semester.yearName,
      ...(reason && { reason }),
    },
    ip,
  });
  return { status: 'UNLOCKED' };
}

// UC-87 View Grade Change History: newest first, 50 per page. Filters: semester (required), class, subject,
// student (name or code, accents ignored – business-rules §16).
export async function listHistory(query) {
  const semester = await loadSemester(pool, query.semesterId);
  const classId = query.classId ? parseId(query.classId) : null;
  const subjectId = query.subjectId ? parseId(query.subjectId) : null;
  const search = containsPattern(query.search);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const fold = (column) => `lower(translate(${column}, $5, $6))`;
  const { rows } = await pool.query(
    `SELECT h.history_id AS id, h.old_score AS "oldScore", h.new_score AS "newScore", h.changed_at AS "changedAt",
            cu.full_name AS "changedBy", cu.username AS "changedByUsername",
            su.full_name AS "studentName", s.student_code AS "studentCode",
            c.class_name AS "className", sb.subject_name AS "subjectName",
            gc.component_name AS "componentName", gc.score_count AS "scoreCount", g.attempt_no AS "attemptNo",
            COUNT(*) OVER() AS total
     FROM grade_histories h
     JOIN grades g ON g.grade_id = h.grade_id
     JOIN grade_components gc ON gc.component_id = g.component_id
     JOIN class_enrollments e ON e.enrollment_id = g.enrollment_id
     JOIN classes c ON c.class_id = e.class_id
     JOIN students s ON s.student_id = e.student_id
     JOIN users su ON su.user_id = s.user_id
     JOIN subjects sb ON sb.subject_id = gc.subject_id
     JOIN users cu ON cu.user_id = h.changed_by
     WHERE gc.semester_id = $1 AND ($2::bigint IS NULL OR c.class_id = $2) AND ($3::bigint IS NULL OR gc.subject_id = $3)
       AND ($4::text IS NULL OR ${fold('su.full_name')} LIKE $4 OR lower(s.student_code) LIKE $4)
     ORDER BY h.changed_at DESC, h.history_id DESC
     LIMIT $7 OFFSET $8`,
    [
      semester.semesterId,
      classId,
      subjectId,
      search,
      VI_TRANSLATE.from,
      VI_TRANSLATE.to,
      HISTORY_PAGE_SIZE,
      (page - 1) * HISTORY_PAGE_SIZE,
    ],
  );
  return {
    semester,
    items: rows.map(({ total, ...r }) => ({
      ...r,
      oldScore: r.oldScore === null ? null : Number(r.oldScore),
      newScore: r.newScore === null ? null : Number(r.newScore),
    })),
    total: rows[0]?.total ?? 0,
    page,
    pageSize: HISTORY_PAGE_SIZE,
  };
}
