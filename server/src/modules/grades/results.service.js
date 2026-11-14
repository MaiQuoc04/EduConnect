import { pool } from '../../config/db.js';
import { badRequest, notFound } from '../../utils/AppError.js';
import { overallAverage, rankStudents, roundScore, semesterAverage, toNumber, yearAverage } from './grades.calc.js';
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

// FE-11 (owner: Linh) – Results & Ranking: UC-88 View Grades (SCR-47) and UC-89 View Class Ranking (SCR-48).
// Scope (permissions.md notes 7, 12): student = own, parent = linked children, teacher = classes they teach (homeroom:
// whole class), School Manager = whole school, read only. Students and parents see only their OWN rank.
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
 * averages per subject and semester, year averages, overall averages and ranks.
 * Subjects = those with a grade structure for the class's grade in that year; when the class type has subjects set
 * for the year (FE-04), only those. A subject without a structure (e.g. one assessed pass / fail) is not counted.
 * ASSUMPTION (FE-11 owner, 10/11/2026): scores a student got in another class of the same year (moved by UC-10
 * Transfer) count too; when both classes have the same score slot, the score of this class wins.
 */
// finalizedOnly (students and parents, FE-11 owner 14/11/2026): only grade books that the teacher has finalized
// (grade_locks LOCKED) count – a book still being entered, or unlocked for corrections, is "not published": its
// scores are left out of every average and ranking, so nothing of it can be read or worked out.
export async function computeClass(db, cls, { finalizedOnly = false } = {}) {
  const { rows: semesters } = await db.query(
    `SELECT semester_id AS "semesterId", semester_no AS "semesterNo" FROM semesters
     WHERE school_year_id = $1 ORDER BY semester_no`,
    [cls.schoolYearId],
  );
  const semesterIds = semesters.map((s) => s.semesterId);
  const { rows: components } = await db.query(
    `SELECT gc.component_id AS "componentId", gc.subject_id AS "subjectId", gc.semester_id AS "semesterId",
            gc.component_name AS name, gc.weight, gc.score_count AS "scoreCount"
     FROM grade_components gc
     WHERE gc.grade_level_id = $1 AND gc.semester_id = ANY($2::bigint[])
     ORDER BY gc.component_id`,
    [cls.gradeLevelId, semesterIds],
  );
  const { rows: trackSubjects } = await db.query(
    'SELECT subject_id FROM track_subjects WHERE track_id = $1 AND school_year_id = $2',
    [cls.trackId, cls.schoolYearId],
  );
  const inTrack = new Set(trackSubjects.map((r) => String(r.subject_id)));
  const usable = components.filter((c) => !inTrack.size || inTrack.has(String(c.subjectId)));
  const subjectIds = [...new Set(usable.map((c) => String(c.subjectId)))];
  const { rows: subjects } = subjectIds.length
    ? await db.query(
        `SELECT subject_id AS "subjectId", subject_code AS "subjectCode", subject_name AS "subjectName"
         FROM subjects WHERE subject_id = ANY($1::bigint[]) ORDER BY subject_name COLLATE "vi-VN-x-icu"`,
        [subjectIds],
      )
    : { rows: [] };

  const { rows: locks } = await db.query(
    'SELECT subject_id AS "subjectId", semester_id AS "semesterId", status FROM grade_locks WHERE class_id = $1',
    [cls.classId],
  );
  const finalized = (subjectId, semesterId) =>
    locks.some((l) => String(l.subjectId) === String(subjectId) && String(l.semesterId) === String(semesterId) && l.status === 'LOCKED');
  const published = (subjectId, semesterId) => !finalizedOnly || finalized(subjectId, semesterId);
  const counted = usable.filter((c) => published(c.subjectId, c.semesterId));

  const enrollments = await classEnrollments(db, cls.classId);
  const studentIds = enrollments.map((e) => e.studentId);
  const componentIds = counted.map((c) => c.componentId);
  const { rows: gradeRows } =
    studentIds.length && componentIds.length
      ? await db.query(
          `SELECT e.student_id AS "studentId", e.class_id AS "classId", g.component_id AS "componentId",
                  g.attempt_no AS "attemptNo", g.score
           FROM grades g
           JOIN class_enrollments e ON e.enrollment_id = g.enrollment_id
           JOIN classes c ON c.class_id = e.class_id
           WHERE e.student_id = ANY($1::bigint[]) AND c.school_year_id = $2 AND g.component_id = ANY($3::bigint[])
             AND g.score IS NOT NULL`,
          [studentIds, cls.schoolYearId, componentIds],
        )
      : { rows: [] };

  // Scores per student and slot; this class wins over another class of the year.
  const slots = new Map(); // studentId -> Map("componentId:attempt" -> { score, here })
  for (const g of gradeRows) {
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
      const bySemester = semesters.map((se) => {
        const comps = componentsOf(sub.subjectId, se.semesterId);
        const scores = mine.filter((m) => comps.some((c) => String(c.componentId) === String(m.componentId)));
        return {
          semesterId: se.semesterId,
          // false: configured but not finalized yet (students / parents only) – shown as "not published".
          published: !configured(sub.subjectId, se.semesterId) || published(sub.subjectId, se.semesterId),
          components: comps.map((c) => ({
            componentId: c.componentId,
            name: c.name,
            weight: Number(c.weight),
            scoreCount: c.scoreCount,
            scores: Array.from({ length: c.scoreCount }, (_, i) => {
              const hit = scores.find((s) => String(s.componentId) === String(c.componentId) && s.attemptNo === i + 1);
              return hit ? hit.score : null;
            }),
          })),
          average: comps.length ? roundScore(semesterAverage(comps, scores)) : null, // rounded (Circular 22)
        };
      });
      const s1 = bySemester.find((b) => semesters.find((se) => se.semesterId === b.semesterId)?.semesterNo === 1);
      const s2 = bySemester.find((b) => semesters.find((se) => se.semesterId === b.semesterId)?.semesterNo === 2);
      // Year average from the rounded semester averages, then rounded itself (Circular 22).
      return { subjectId: sub.subjectId, bySemester, year: roundScore(yearAverage(s1?.average ?? null, s2?.average ?? null)) };
    });
    const overall = {};
    for (const se of semesters) {
      overall[se.semesterId] = roundScore(
        overallAverage(perSubject.map((p) => p.bySemester.find((b) => b.semesterId === se.semesterId)?.average ?? null)),
      );
    }
    overall.YEAR = roundScore(overallAverage(perSubject.map((p) => p.year)));
    return { ...e, perSubject, overall };
  });

  // Ranks per period, only among studying students (ASSUMPTION FE-11 owner 10/11/2026).
  const ranks = {};
  for (const period of [...semesters.map((s) => s.semesterId), 'YEAR']) {
    const studying = students.filter((s) => s.status === 'STUDYING');
    ranks[period] = new Map(
      rankStudents(studying.map((s) => ({ id: s.studentId, average: s.overall[period] }))).map((r) => [String(r.id), r.rank]),
    );
    ranks[period].ranked = [...ranks[period].values()].filter((r) => r !== null).length;
  }

  // Provisional while a subject's grade book of the period is not finalized.
  const provisional = {};
  for (const se of semesters) {
    provisional[se.semesterId] = subjects.some(
      (sub) => componentsOf(sub.subjectId, se.semesterId).length && !finalized(sub.subjectId, se.semesterId),
    );
  }
  provisional.YEAR = semesters.some((se) => provisional[se.semesterId]) || semesters.length < 2;

  return { semesters, subjects, students, ranks, provisional };
}

// 'YEAR' or a semester id of the class's year.
function readPeriod(value, semesters) {
  if (value === undefined || value === null || value === '' || value === 'YEAR') return 'YEAR';
  const found = semesters.find((s) => String(s.semesterId) === String(value));
  if (!found) throw badRequest('MSG_SEMESTER_CLASS_MISMATCH', 'This semester is not in the class’s school year.');
  return found.semesterId;
}

// --- UC-88 / UC-89 for a class (teacher, School Manager) ------------------------------------------------------------

// Class results for one period: per student the subject averages (semester, or year = (S1 + 2 × S2) / 3), the
// overall average and the rank. Sorting by rank gives UC-89; by name gives UC-88.
export async function classResults(classIdParam, query, user) {
  const cls = await loadClass(pool, classIdParam);
  await assertCanViewClass(pool, user, cls);
  const data = await computeClass(pool, cls);
  const period = readPeriod(query.period, data.semesters);
  const rankMap = data.ranks[period];
  return {
    class: cls,
    period,
    semesters: data.semesters,
    subjects: data.subjects,
    provisional: data.provisional[period],
    ranked: rankMap.ranked,
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
      overall: roundScore(s.overall[period]),
      rank: s.status === 'STUDYING' ? rankMap.get(String(s.studentId)) ?? null : null,
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
// overall averages and the student's OWN rank in the class (never the others' ranks).
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
  // Students and parents see a grade book only once the teacher has finalized it (FE-11 owner, 14/11/2026).
  const finalizedOnly = user.activeRole === 'STUDENT' || user.activeRole === 'PARENT';
  const data = await computeClass(pool, cls, { finalizedOnly });
  const me = data.students.find((s) => String(s.studentId) === String(studentId));
  const studying = me?.status === 'STUDYING';
  const rankOf = (period) => ({
    rank: studying ? data.ranks[period].get(String(studentId)) ?? null : null,
    ranked: data.ranks[period].ranked,
    provisional: data.provisional[period],
  });
  return {
    student: who[0],
    class: { classId: cls.classId, className: cls.className, gradeLevelName: cls.gradeLevelName, yearName: cls.yearName },
    enrollmentStatus: me?.status ?? null,
    semesters: data.semesters.map((se) => ({
      ...se,
      overall: roundScore(me?.overall[se.semesterId] ?? null),
      ...rankOf(se.semesterId),
    })),
    year: { overall: roundScore(me?.overall.YEAR ?? null), ...rankOf('YEAR') },
    subjects: data.subjects.map((sub) => {
      const p = me?.perSubject.find((x) => String(x.subjectId) === String(sub.subjectId));
      return {
        ...sub,
        semesters: (p?.bySemester ?? []).map((b) => ({ ...b, average: roundScore(b.average) })),
        year: roundScore(p?.year ?? null),
      };
    }),
  };
}
