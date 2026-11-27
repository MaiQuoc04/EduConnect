import { pool } from '../../config/db.js';
import { badRequest, notFound } from '../../utils/AppError.js';
import {
  academicLevel,
  roundScore,
  semesterAverage,
  semesterResult,
  toNumber,
  yearAverage,
  yearResult,
} from './grades.calc.js';
import {
  assertCanViewClass,
  assertCanViewStudent,
  classEnrollments,
  loadClass,
  ownStudents,
  parseId,
  teacherClassIds,
  teacherIdOf,
} from './grades.scope.js';

// FE-11 (owner: Linh) – Results: UC-88 View Grades (SCR-47); UC-89 (SCR-48) no longer ranks students (23/11/2026,
// Circular 22): the results show the academic level of each student instead.
// Scope (permissions.md notes 7, 12): student = own, parent = linked children, teacher = classes they teach (homeroom:
// whole class), School Manager = whole school, read only. Students and parents see only their OWN results.
// Averages are computed here (grades.calc.js) and never stored.

// --- Pickers -------------------------------------------------------------------------------------------------------

// School years (newest first) with their semesters, grade levels, and the current year / semester by date (MOM-05:
// the latest year that has started, else the first one; in it the semester containing today, else the latest
// started, else semester 1).
export async function options() {
  const { rows: years } = await pool.query(
    `SELECT sy.school_year_id AS "schoolYearId", sy.year_name AS "yearName", sy.start_date AS "startDate",
            sy.end_date AS "endDate", sy.start_date <= CURRENT_DATE AS started,
            COALESCE(json_agg(json_build_object('semesterId', se.semester_id, 'semesterNo', se.semester_no,
                       'startDate', se.start_date, 'endDate', se.end_date, 'status', se.status,
                       'started', se.start_date <= CURRENT_DATE, 'current', CURRENT_DATE BETWEEN se.start_date AND se.end_date)
                     ORDER BY se.semester_no) FILTER (WHERE se.semester_id IS NOT NULL), '[]') AS semesters
     FROM school_years sy LEFT JOIN semesters se ON se.school_year_id = sy.school_year_id
     GROUP BY sy.school_year_id ORDER BY sy.start_date DESC`,
  );
  const { rows: gradeLevels } = await pool.query(
    'SELECT grade_level_id AS "gradeLevelId", grade_level_name AS "gradeLevelName" FROM grade_levels ORDER BY grade_level_name',
  );
  const current = years.find((y) => y.started) ?? years[years.length - 1] ?? null;
  const semesters = current?.semesters ?? [];
  const currentSemester =
    semesters.find((s) => s.current) ?? [...semesters].reverse().find((s) => s.started) ?? semesters[0] ?? null;
  return {
    years: years.map(({ started, ...y }) => y),
    gradeLevels,
    currentYearId: current?.schoolYearId ?? null,
    currentSemesterId: currentSemester?.semesterId ?? null,
  };
}

// Classes a teacher / School Manager may look at in a school year.
export async function listClasses(query, user) {
  const yearId = parseId(query.schoolYearId, 'NOT_FOUND', 'School year not found.');
  let ids = null;
  if (user.activeRole === 'TEACHER') ids = await teacherClassIds(pool, await teacherIdOf(pool, user.userId), yearId);
  const { rows } = await pool.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", g.grade_level_name AS "gradeLevelName",
            (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.class_id AND e.status = 'STUDYING')::int AS "studentCount"
     FROM classes c JOIN grade_levels g ON g.grade_level_id = c.grade_level_id
     WHERE c.deleted_at IS NULL AND c.school_year_id = $1 AND ($2::bigint[] IS NULL OR c.class_id = ANY($2::bigint[]))
     ORDER BY g.grade_level_name, c.class_name`,
    [yearId, ids],
  );
  return { items: rows };
}

// The students a student / parent may open (self / linked children).
export async function myStudents(user) {
  return { items: await ownStudents(pool, user) };
}

// --- Calculation for one class --------------------------------------------------------------------------------------

/**
 * Everything needed to show one class's results for its school year: subjects, every studying (and former) student's
 * averages per subject and semester, year averages and the academic level per period (Circular 22, Article 9).
 * No overall average and no ranking since 23/11/2026 (Circular 22 has none and does not compare students).
 * Subjects = every subject of the class type for the year (FE-04 track_subjects), also one that has no grade structure
 * yet, so a level is never decided on part of the subjects the class studies (FE-11 owner, 27/11/2026). When the type
 * has no subjects set: those with a grade structure for the class's grade in that year.
 * ASSUMPTION (FE-11 owner, 10/11/2026): scores a student got in another class of the same year (moved by UC-10
 * Transfer) count too; when both classes have the same score slot, the score of this class wins.
 */
// finalizedOnly (students and parents, FE-11 owner 14/11/2026): only finalized grade books count. A book still being
// entered (never finalized) is "not published": its scores are left out of every average and level. A book that
// the School Manager unlocked for a correction (grade review) keeps showing the scores AS FINALIZED until the teacher
// finalizes it again – see finalizedScores().
export async function computeClass(db, cls, { finalizedOnly = false } = {}) {
  const { rows: semesters } = await db.query(
    `SELECT semester_id AS "semesterId", semester_no AS "semesterNo" FROM semesters
     WHERE school_year_id = $1 ORDER BY semester_no`,
    [cls.schoolYearId],
  );
  const semesterIds = semesters.map((s) => s.semesterId);
  const { rows: components } = await db.query(
    `SELECT gc.component_id AS "componentId", gc.subject_id AS "subjectId", gc.semester_id AS "semesterId",
            gc.component_name AS name, gc.weight, gc.score_count AS "scoreCount", gc.assessment_type AS "assessmentType"
     FROM grade_components gc
     WHERE gc.grade_level_id = $1 AND gc.semester_id = ANY($2::bigint[])
     ORDER BY gc.component_id`,
    [cls.gradeLevelId, semesterIds],
  );
  const { rows: trackSubjects } = await db.query(
    `SELECT ts.subject_id, s.deleted_at IS NOT NULL AS deleted
     FROM track_subjects ts JOIN subjects s ON s.subject_id = ts.subject_id
     WHERE ts.track_id = $1 AND ts.school_year_id = $2`,
    [cls.trackId, cls.schoolYearId],
  );
  const inTrack = new Set(trackSubjects.map((r) => String(r.subject_id)));
  const usable = components.filter((c) => !inTrack.size || inTrack.has(String(c.subjectId)));
  // A deleted subject is listed only while it still has a structure: without one it could never get a result.
  const studied = trackSubjects.filter((r) => !r.deleted).map((r) => String(r.subject_id));
  const subjectIds = [...new Set([...usable.map((c) => String(c.subjectId)), ...studied])];
  const { rows: subjects } = subjectIds.length
    ? await db.query(
        `SELECT subject_id AS "subjectId", subject_code AS "subjectCode", subject_name AS "subjectName"
         FROM subjects WHERE subject_id = ANY($1::bigint[]) ORDER BY subject_name COLLATE "vi-VN-x-icu"`,
        [subjectIds],
      )
    : { rows: [] };
  // SCORE or COMMENT (assessed by comments, 27/11/2026); the same in every semester of the year (structure.service.js).
  for (const sub of subjects) {
    const commented = usable.some((c) => String(c.subjectId) === String(sub.subjectId) && c.assessmentType === 'COMMENT');
    sub.assessmentType = commented ? 'COMMENT' : 'SCORE';
  }

  const { rows: locks } = await db.query(
    `SELECT subject_id AS "subjectId", semester_id AS "semesterId", status, unlocked_at AS "unlockedAt"
     FROM grade_locks WHERE class_id = $1`,
    [cls.classId],
  );
  const lockOf = (subjectId, semesterId) =>
    locks.find((l) => String(l.subjectId) === String(subjectId) && String(l.semesterId) === String(semesterId));
  const finalized = (subjectId, semesterId) => lockOf(subjectId, semesterId)?.status === 'LOCKED';
  // Unlocked = finalized before, now being corrected: students / parents keep seeing the finalized scores.
  const underReview = (subjectId, semesterId) => lockOf(subjectId, semesterId)?.status === 'UNLOCKED';
  const published = (subjectId, semesterId) =>
    !finalizedOnly || finalized(subjectId, semesterId) || underReview(subjectId, semesterId);
  const counted = usable.filter((c) => published(c.subjectId, c.semesterId));

  const enrollments = await classEnrollments(db, cls.classId);
  const studentIds = enrollments.map((e) => e.studentId);
  const componentIds = counted.map((c) => c.componentId);
  const { rows: gradeRows } =
    studentIds.length && componentIds.length
      ? await db.query(
          `SELECT g.grade_id AS "gradeId", e.student_id AS "studentId", e.class_id AS "classId",
                  g.component_id AS "componentId", g.attempt_no AS "attemptNo", g.score, g.result,
                  g.entered_at AS "enteredAt"
           FROM grades g
           JOIN class_enrollments e ON e.enrollment_id = g.enrollment_id
           JOIN classes c ON c.class_id = e.class_id
           WHERE e.student_id = ANY($1::bigint[]) AND c.school_year_id = $2 AND g.component_id = ANY($3::bigint[])`,
          [studentIds, cls.schoolYearId, componentIds],
        )
      : { rows: [] };
  const reviewLock = (g) => {
    if (!finalizedOnly || String(g.classId) !== String(cls.classId)) return null;
    const comp = usable.find((c) => String(c.componentId) === String(g.componentId));
    const lock = comp && lockOf(comp.subjectId, comp.semesterId);
    return lock?.status === 'UNLOCKED' && lock.unlockedAt ? lock : null;
  };
  const shownRows = (await finalizedScores(db, gradeRows, reviewLock)).filter((g) => g.score !== null || g.result !== null);

  // Scores per student and slot; this class wins over another class of the year.
  const slots = new Map(); // studentId -> Map("componentId:attempt" -> { score, here })
  for (const g of shownRows) {
    const key = String(g.studentId);
    if (!slots.has(key)) slots.set(key, new Map());
    const slot = `${g.componentId}:${g.attemptNo}`;
    const here = String(g.classId) === String(cls.classId);
    const prev = slots.get(key).get(slot);
    if (!prev || (here && !prev.here)) slots.get(key).set(slot, { ...g, score: toNumber(g.score), here });
  }

  const componentsOf = (subjectId, semesterId) =>
    counted.filter((c) => String(c.subjectId) === String(subjectId) && String(c.semesterId) === String(semesterId));
  const configured = (subjectId, semesterId) =>
    usable.some((c) => String(c.subjectId) === String(subjectId) && String(c.semesterId) === String(semesterId));

  const students = enrollments.map((e) => {
    const mine = [...(slots.get(String(e.studentId))?.values() ?? [])];
    const perSubject = subjects.map((sub) => {
      const comment = sub.assessmentType === 'COMMENT';
      const bySemester = semesters.map((se) => {
        const comps = componentsOf(sub.subjectId, se.semesterId);
        const scores = mine.filter((m) => comps.some((c) => String(c.componentId) === String(m.componentId)));
        const slotValue = (hit) => (comment ? (hit?.result ?? null) : (hit?.score ?? null));
        return {
          semesterId: se.semesterId,
          // false: configured but not finalized yet (students / parents only) – shown as "not published".
          published: !configured(sub.subjectId, se.semesterId) || published(sub.subjectId, se.semesterId),
          components: comps.map((c) => ({
            componentId: c.componentId,
            name: c.name,
            weight: Number(c.weight),
            scoreCount: c.scoreCount,
            // COMMENT subject: 'PASS' / 'FAIL' per assessment instead of a score.
            scores: Array.from({ length: c.scoreCount }, (_, i) =>
              slotValue(scores.find((s) => String(s.componentId) === String(c.componentId) && s.attemptNo === i + 1)),
            ),
          })),
          average: comps.length && !comment ? roundScore(semesterAverage(comps, scores)) : null, // rounded (Circular 22)
          result: comment ? semesterResult(comps, scores) : null, // Đạt / Chưa đạt of a COMMENT subject
        };
      });
      const s1 = bySemester.find((b) => semesters.find((se) => se.semesterId === b.semesterId)?.semesterNo === 1);
      const s2 = bySemester.find((b) => semesters.find((se) => se.semesterId === b.semesterId)?.semesterNo === 2);
      // COMMENT subject: the year result is the semester 2 result (Circular 22).
      if (comment) return { subjectId: sub.subjectId, comment, bySemester, year: null, yearResult: yearResult(s2?.result ?? null) };
      // Year average from the rounded semester averages, then rounded itself (Circular 22).
      return {
        subjectId: sub.subjectId,
        comment,
        bySemester,
        year: roundScore(yearAverage(s1?.average ?? null, s2?.average ?? null)),
        yearResult: null,
      };
    });
    // Academic level per period (Circular 22, Article 9): it needs the result of EVERY subject the class studies that
    // year (`subjects`), so every period uses the same list (FE-11 owner, 27/11/2026). A subject without an average in
    // the period – no structure yet, a missing score, or (students / parents) a book not published yet – leaves the
    // level empty ("–").
    // Subjects assessed by comments count with their Đạt / Chưa đạt result (27/11/2026).
    const scored = perSubject.filter((p) => !p.comment);
    const commented = perSubject.filter((p) => p.comment);
    const inSemester = (p, se) => p.bySemester.find((b) => b.semesterId === se.semesterId);
    const level = {};
    for (const se of semesters) {
      level[se.semesterId] = academicLevel(
        scored.map((p) => inSemester(p, se)?.average ?? null),
        commented.map((p) => inSemester(p, se)?.result ?? null),
      );
    }
    level.YEAR = academicLevel(
      scored.map((p) => p.year),
      commented.map((p) => p.yearResult),
    );
    return { ...e, perSubject, level };
  });

  // Provisional while a subject's grade book of the period is not finalized.
  const provisional = {};
  for (const se of semesters) {
    provisional[se.semesterId] = subjects.some(
      // For students / parents a book under review shows its finalized scores, so it is not provisional.
      (sub) =>
        componentsOf(sub.subjectId, se.semesterId).length &&
        !finalized(sub.subjectId, se.semesterId) &&
        !(finalizedOnly && underReview(sub.subjectId, se.semesterId)),
    );
  }
  provisional.YEAR = semesters.some((se) => provisional[se.semesterId]) || semesters.length < 2;

  return { semesters, subjects, students, provisional };
}

// Scores of books under review (reviewLock(g) = the UNLOCKED lock) as they were when finalized, rebuilt from
// grade_histories: the first change after the unlock holds the finalized value in old_score; a score created after the
// unlock did not exist then. Every finalized score was complete and is never deleted, so this is exact.
async function finalizedScores(db, rows, reviewLock) {
  const affected = rows.filter((g) => reviewLock(g));
  if (!affected.length) return rows;
  const since = new Date(Math.min(...affected.map((g) => new Date(reviewLock(g).unlockedAt).getTime())));
  const { rows: changes } = await db.query(
    `SELECT grade_id AS "gradeId", old_score AS "oldScore", old_result AS "oldResult", changed_at AS "changedAt"
     FROM grade_histories WHERE grade_id = ANY($1::bigint[]) AND changed_at >= $2
     ORDER BY changed_at, history_id`,
    [affected.map((g) => g.gradeId), since],
  );
  return rows.flatMap((g) => {
    const lock = reviewLock(g);
    if (!lock) return [g];
    const unlockedAt = new Date(lock.unlockedAt).getTime();
    if (new Date(g.enteredAt).getTime() >= unlockedAt) return []; // entered during the review: not finalized yet
    const first = changes.find((h) => String(h.gradeId) === String(g.gradeId) && new Date(h.changedAt).getTime() >= unlockedAt);
    return [first ? { ...g, score: first.oldScore, result: first.oldResult } : g];
  });
}

// 'YEAR' or a semester id of the class's year.
function readPeriod(value, semesters) {
  if (value === undefined || value === null || value === '' || value === 'YEAR') return 'YEAR';
  const found = semesters.find((s) => String(s.semesterId) === String(value));
  if (!found) throw badRequest('MSG_SEMESTER_CLASS_MISMATCH', 'This semester is not in the class’s school year.');
  return found.semesterId;
}

// --- UC-88 / UC-89 for a class (teacher, School Manager) ------------------------------------------------------------

// Class results for one period: per student the subject averages (semester, or year = (S1 + 2 × S2) / 3) and the
// academic level (UC-88; UC-89 shows the levels of the class since 23/11/2026, no ranking).
export async function classResults(classIdParam, query, user) {
  const cls = await loadClass(pool, classIdParam);
  await assertCanViewClass(pool, user, cls);
  const data = await computeClass(pool, cls);
  const period = readPeriod(query.period, data.semesters);
  return {
    class: cls,
    period,
    semesters: data.semesters,
    subjects: data.subjects,
    provisional: data.provisional[period],
    students: data.students.map((s) => ({
      studentId: s.studentId,
      studentCode: s.studentCode,
      fullName: s.fullName,
      status: s.status,
      averages: Object.fromEntries(
        s.perSubject.map((p) => [
          p.subjectId,
          roundScore(period === 'YEAR' ? p.year : p.bySemester.find((b) => b.semesterId === period)?.average ?? null),
        ]),
      ),
      // Subjects assessed by comments (subjects[].assessmentType COMMENT): 'PASS' / 'FAIL' / null instead of an average.
      results: Object.fromEntries(
        s.perSubject
          .filter((p) => p.comment)
          .map((p) => [
            p.subjectId,
            period === 'YEAR' ? p.yearResult : (p.bySemester.find((b) => b.semesterId === period)?.result ?? null),
          ]),
      ),
      level: s.level[period],
    })),
  };
}

// --- UC-88 / UC-89 for one student (student, parent, teacher, School Manager) ---------------------------------------

// The student's class in a school year: the studying enrollment, else the latest one.
async function classOfStudent(db, studentId, schoolYearId) {
  const { rows } = await db.query(
    `SELECT e.class_id FROM class_enrollments e JOIN classes c ON c.class_id = e.class_id
     WHERE e.student_id = $1 AND c.school_year_id = $2 AND c.deleted_at IS NULL
     ORDER BY (e.status = 'STUDYING') DESC, e.enrolled_at DESC LIMIT 1`,
    [studentId, schoolYearId],
  );
  return rows[0]?.class_id ?? null;
}

// Report card of one student for a school year: every subject's scores per semester, semester and year averages,
// and the academic level of each semester and of the year (never anything about other students).
export async function studentResults(studentIdParam, query, user) {
  const studentId = parseId(studentIdParam, 'MSG_STUDENT_NOT_FOUND', 'Student not found.');
  const yearId = parseId(query.schoolYearId, 'NOT_FOUND', 'School year not found.');
  await assertCanViewStudent(pool, user, studentId, yearId);
  const { rows: who } = await pool.query(
    `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName"
     FROM students s JOIN users u ON u.user_id = s.user_id WHERE s.student_id = $1`,
    [studentId],
  );
  if (!who[0]) throw notFound('MSG_STUDENT_NOT_FOUND', 'Student not found.');
  const classId = await classOfStudent(pool, studentId, yearId);
  if (!classId) return { student: who[0], class: null, semesters: [], subjects: [] };

  const cls = await loadClass(pool, classId);
  // Students and parents see a grade book only once the teacher has finalized it, and during a correction (unlocked)
  // still the finalized scores (FE-11 owner, 14/11/2026).
  const finalizedOnly = user.activeRole === 'STUDENT' || user.activeRole === 'PARENT';
  const data = await computeClass(pool, cls, { finalizedOnly });
  const me = data.students.find((s) => String(s.studentId) === String(studentId));
  const levelOf = (period) => ({ level: me?.level[period] ?? null, provisional: data.provisional[period] });
  return {
    student: who[0],
    class: { classId: cls.classId, className: cls.className, gradeLevelName: cls.gradeLevelName, yearName: cls.yearName },
    enrollmentStatus: me?.status ?? null,
    semesters: data.semesters.map((se) => ({
      ...se,
      ...levelOf(se.semesterId),
    })),
    year: levelOf('YEAR'),
    subjects: data.subjects.map((sub) => {
      const p = me?.perSubject.find((x) => String(x.subjectId) === String(sub.subjectId));
      return {
        ...sub,
        semesters: (p?.bySemester ?? []).map((b) => ({ ...b, average: roundScore(b.average) })),
        year: roundScore(p?.year ?? null),
        yearResult: p?.yearResult ?? null, // COMMENT subject: Đạt / Chưa đạt of the year (= semester 2)
      };
    }),
  };
}
