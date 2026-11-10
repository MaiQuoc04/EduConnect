import { pool, withTransaction } from '../../config/db.js';
import { badRequest, forbidden } from '../../utils/AppError.js';
import { missingSlots, parseScore, roundScore, semesterAverage } from './grades.calc.js';
import {
  assertCanViewClass,
  assertSameYear,
  bookStatus,
  classEnrollments,
  conflict,
  isAssigned,
  loadClass,
  loadComponents,
  loadSemester,
  loadSubject,
  lockBookForWrite,
  teacherIdOf,
} from './grades.scope.js';

// FE-11 (owner: Linh) – the grade book of one class × subject × semester: UC-83 Enter Grades, UC-85 Finalize Grades
// (teacher), read only for School Manager (SCR-68) and the class's other teachers. UC-84 import uses applyChanges.
// Every score is one `grades` row (attempt_no); every entry / change writes `grade_histories` (first old_score NULL);
// rows are never deleted – clearing a score sets it to NULL.

const MAX_CHANGES = 5000;

// The class, subject and semester of a grade book, checked to belong together.
export async function loadBookKey(db, { classId, subjectId, semesterId }) {
  const cls = await loadClass(db, classId);
  const subject = await loadSubject(db, subjectId);
  const semester = await loadSemester(db, semesterId);
  assertSameYear(cls, semester);
  return { cls, subject, semester };
}

// May this user edit the book now? (teacher with a current assignment, book not finalized, structure configured)
async function editRights(db, user, cls, subject) {
  if (user.activeRole !== 'TEACHER') return { teacherId: null, assigned: false };
  const teacherId = await teacherIdOf(db, user.userId);
  return { teacherId, assigned: await isAssigned(db, teacherId, cls.classId, subject.subjectId) };
}

async function lockInfo(db, classId, subjectId, semesterId) {
  const { rows } = await db.query(
    `SELECT l.status, l.locked_at AS "lockedAt", lu.full_name AS "lockedBy", l.unlocked_at AS "unlockedAt",
            uu.full_name AS "unlockedBy"
     FROM grade_locks l
     LEFT JOIN users lu ON lu.user_id = l.locked_by
     LEFT JOIN users uu ON uu.user_id = l.unlocked_by
     WHERE l.class_id = $1 AND l.subject_id = $2 AND l.semester_id = $3`,
    [classId, subjectId, semesterId],
  );
  return rows[0] ?? { status: 'OPEN' };
}

async function bookScores(db, enrollmentIds, componentIds) {
  if (!enrollmentIds.length || !componentIds.length) return [];
  const { rows } = await db.query(
    `SELECT enrollment_id AS "enrollmentId", component_id AS "componentId", attempt_no AS "attemptNo", score
     FROM grades WHERE enrollment_id = ANY($1::bigint[]) AND component_id = ANY($2::bigint[])`,
    [enrollmentIds, componentIds],
  );
  return rows;
}

// SCR-44 / SCR-68: components (columns), students (rows) with their scores, average and what is still missing.
export async function getBook(params, user) {
  const { cls, subject, semester } = await loadBookKey(pool, params);
  const { assigned } = await editRights(pool, user, cls, subject);
  if (!assigned) await assertCanViewClass(pool, user, cls);

  const components = await loadComponents(pool, subject.subjectId, cls.gradeLevelId, semester.semesterId);
  const enrollments = await classEnrollments(pool, cls.classId);
  const scores = await bookScores(
    pool,
    enrollments.map((e) => e.enrollmentId),
    components.map((c) => c.componentId),
  );
  const lock = await lockInfo(pool, cls.classId, subject.subjectId, semester.semesterId);

  const students = enrollments.map((e) => {
    const own = scores.filter((s) => String(s.enrollmentId) === String(e.enrollmentId));
    return {
      ...e,
      scores: own.map((s) => ({ componentId: s.componentId, attemptNo: s.attemptNo, score: s.score === null ? null : Number(s.score) })),
      average: roundScore(semesterAverage(components, own)),
      missing: e.status === 'STUDYING' ? missingSlots(components, own).length : 0,
    };
  });
  const finalized = lock.status === 'LOCKED';
  return {
    class: cls,
    subject,
    semester,
    components,
    students,
    lock,
    canEdit: assigned && !finalized && components.length > 0,
    canFinalize: assigned && !finalized && components.length > 0,
    assigned,
  };
}

// Reads and checks the changed cells sent by the grid or the import. Last value wins for a repeated cell.
function readChanges(list, components, enrollments) {
  if (!Array.isArray(list) || !list.length) throw badRequest('MSG_GRADES_NO_CHANGE', 'There is nothing to save.');
  if (list.length > MAX_CHANGES) throw badRequest('MSG_GRADES_TOO_MANY', 'Too many changes at once.');
  const byComponent = new Map(components.map((c) => [String(c.componentId), c]));
  const byEnrollment = new Map(enrollments.map((e) => [String(e.enrollmentId), e]));
  const cells = new Map();
  for (const ch of list) {
    const component = byComponent.get(String(ch?.componentId));
    const enrollment = byEnrollment.get(String(ch?.enrollmentId));
    const attemptNo = Number(ch?.attemptNo);
    const parsed = parseScore(ch?.score);
    if (!component || !enrollment || !Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > component.scoreCount) {
      throw badRequest('MSG_GRADES_CELL_INVALID', 'A changed cell does not belong to this grade book.');
    }
    if (enrollment.status !== 'STUDYING') {
      throw conflict('MSG_GRADES_STUDENT_LEFT', 'A student has left the class; their grades can only be viewed.');
    }
    if (!parsed.ok) {
      throw badRequest('MSG_SCORE_INVALID', 'A score must be from 0 to 10 with at most 2 decimals.', {
        enrollmentId: enrollment.enrollmentId,
        componentId: component.componentId,
        attemptNo,
      });
    }
    cells.set(`${enrollment.enrollmentId}:${component.componentId}:${attemptNo}`, {
      enrollmentId: Number(enrollment.enrollmentId),
      componentId: Number(component.componentId),
      attemptNo,
      score: parsed.value,
    });
  }
  return [...cells.values()];
}

/**
 * Writes changed cells of one grade book in one transaction, with grade_histories. Used by UC-83 and UC-84.
 * @param {object} params { classId, subjectId, semesterId }
 * @param {object} user req.user (teacher)
 * @param {(ctx) => object[]} buildChanges receives { components, enrollments, scores } read INSIDE the transaction
 *   and returns the raw changes [{ enrollmentId, componentId, attemptNo, score }]
 * @returns {{ changed: number }}
 */
export async function applyChanges(params, user, buildChanges) {
  const { cls, subject, semester } = await loadBookKey(pool, params);
  const { teacherId, assigned } = await editRights(pool, user, cls, subject);
  if (!assigned) throw forbidden('MSG_GRADES_NOT_ASSIGNED', 'You are not assigned to teach this subject in this class.');

  return withTransaction(async (client) => {
    await lockBookForWrite(client, cls.classId, subject.subjectId, semester.semesterId);
    // Same key as UC-81 saving the structure, so a structure cannot be replaced under the first grades.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('grade-structure:' || $1 || ':' || $2 || ':' || $3))", [
      String(subject.subjectId),
      String(cls.gradeLevelId),
      String(semester.semesterId),
    ]);
    if ((await bookStatus(client, cls.classId, subject.subjectId, semester.semesterId)) === 'LOCKED') {
      throw conflict('MSG_GRADES_FINALIZED', 'These grades are finalized. Ask the School Manager to unlock them.');
    }
    const components = await loadComponents(client, subject.subjectId, cls.gradeLevelId, semester.semesterId);
    if (!components.length) throw conflict('MSG_STRUCTURE_EMPTY', 'This subject has no grade structure yet.');
    const enrollments = await classEnrollments(client, cls.classId);
    const scores = await bookScores(
      client,
      enrollments.map((e) => e.enrollmentId),
      components.map((c) => c.componentId),
    );
    const cells = readChanges(buildChanges({ components, enrollments, scores }), components, enrollments);

    // Existing rows of the changed cells, locked for this transaction.
    const { rows: existing } = await client.query(
      `SELECT g.grade_id, g.enrollment_id, g.component_id, g.attempt_no, g.score
       FROM grades g
       JOIN unnest($1::bigint[], $2::bigint[], $3::int[]) AS c(enrollment_id, component_id, attempt_no)
         ON c.enrollment_id = g.enrollment_id AND c.component_id = g.component_id AND c.attempt_no = g.attempt_no
       FOR UPDATE OF g`,
      [cells.map((c) => c.enrollmentId), cells.map((c) => c.componentId), cells.map((c) => c.attemptNo)],
    );
    const rowOf = new Map(existing.map((r) => [`${r.enrollment_id}:${r.component_id}:${r.attempt_no}`, r]));
    const inserts = [];
    const updates = [];
    for (const c of cells) {
      const row = rowOf.get(`${c.enrollmentId}:${c.componentId}:${c.attemptNo}`);
      const old = row?.score === null || row?.score === undefined ? null : Number(row.score);
      if (!row) {
        if (c.score !== null) inserts.push(c); // clearing an empty cell changes nothing
      } else if (old !== c.score) {
        updates.push({ ...c, gradeId: row.grade_id, old });
      }
    }

    if (inserts.length) {
      const { rows: created } = await client.query(
        `INSERT INTO grades (enrollment_id, component_id, attempt_no, score, entered_by)
         SELECT c.enrollment_id, c.component_id, c.attempt_no, c.score, $5
         FROM unnest($1::bigint[], $2::bigint[], $3::int[], $4::numeric[]) AS c(enrollment_id, component_id, attempt_no, score)
         RETURNING grade_id, score`,
        [
          inserts.map((c) => c.enrollmentId),
          inserts.map((c) => c.componentId),
          inserts.map((c) => c.attemptNo),
          inserts.map((c) => c.score),
          teacherId,
        ],
      );
      await client.query(
        `INSERT INTO grade_histories (grade_id, old_score, new_score, changed_by)
         SELECT h.grade_id, NULL, h.score, $3 FROM unnest($1::bigint[], $2::numeric[]) AS h(grade_id, score)`,
        [created.map((r) => r.grade_id), created.map((r) => r.score), user.userId],
      );
    }
    if (updates.length) {
      await client.query(
        `UPDATE grades g SET score = u.score
         FROM unnest($1::bigint[], $2::numeric[]) AS u(grade_id, score)
         WHERE g.grade_id = u.grade_id`,
        [updates.map((u) => u.gradeId), updates.map((u) => u.score)],
      );
      await client.query(
        `INSERT INTO grade_histories (grade_id, old_score, new_score, changed_by)
         SELECT h.grade_id, h.old_score, h.new_score, $4
         FROM unnest($1::bigint[], $2::numeric[], $3::numeric[]) AS h(grade_id, old_score, new_score)`,
        [updates.map((u) => u.gradeId), updates.map((u) => u.old), updates.map((u) => u.score), user.userId],
      );
    }
    return { changed: inserts.length + updates.length };
  });
}

// UC-83 Enter Grades: body { changes: [{ enrollmentId, componentId, attemptNo, score }] } (score '' / null = clear).
export async function saveGrades(params, body, user) {
  const result = await applyChanges(params, user, () => body?.changes);
  return { ...result, book: await getBook(params, user) };
}

// UC-85 Finalize Grades: locks the book. Blocked while a studying student is missing a score.
export async function finalizeBook(params, user) {
  const { cls, subject, semester } = await loadBookKey(pool, params);
  const { assigned } = await editRights(pool, user, cls, subject);
  if (!assigned) throw forbidden('MSG_GRADES_NOT_ASSIGNED', 'You are not assigned to teach this subject in this class.');

  await withTransaction(async (client) => {
    await lockBookForWrite(client, cls.classId, subject.subjectId, semester.semesterId);
    if ((await bookStatus(client, cls.classId, subject.subjectId, semester.semesterId)) === 'LOCKED') {
      throw conflict('MSG_GRADES_FINALIZED', 'These grades are already finalized.');
    }
    const components = await loadComponents(client, subject.subjectId, cls.gradeLevelId, semester.semesterId);
    if (!components.length) throw conflict('MSG_STRUCTURE_EMPTY', 'This subject has no grade structure yet.');
    const studying = (await classEnrollments(client, cls.classId)).filter((e) => e.status === 'STUDYING');
    const scores = await bookScores(
      client,
      studying.map((e) => e.enrollmentId),
      components.map((c) => c.componentId),
    );
    const incomplete = studying
      .map((e) => ({
        fullName: e.fullName,
        studentCode: e.studentCode,
        missing: missingSlots(components, scores.filter((s) => String(s.enrollmentId) === String(e.enrollmentId))).length,
      }))
      .filter((s) => s.missing > 0);
    if (incomplete.length) {
      throw conflict('MSG_GRADES_INCOMPLETE', 'Some studying students are missing scores.', {
        count: incomplete.length,
        students: incomplete.slice(0, 20),
      });
    }
    await client.query(
      `INSERT INTO grade_locks (class_id, subject_id, semester_id, status, locked_by, locked_at)
       VALUES ($1, $2, $3, 'LOCKED', $4, NOW())
       ON CONFLICT (class_id, subject_id, semester_id)
       DO UPDATE SET status = 'LOCKED', locked_by = EXCLUDED.locked_by, locked_at = EXCLUDED.locked_at`,
      [cls.classId, subject.subjectId, semester.semesterId, user.userId],
    );
  });
  return getBook(params, user);
}
