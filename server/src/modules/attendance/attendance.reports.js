import ExcelJS from 'exceljs';
import { pool } from '../../config/db.js';
import { badRequest, notFound } from '../../utils/AppError.js';
import { vietnameseNameOrder } from '../../utils/nameSort.js';
import { LESSON_START_SQL, STATUS_LABELS, TODAY_SQL, TZ } from './attendance.constants.js';
import {
  classSubjectScope,
  contextOf,
  deadlineTime,
  loadClass,
  loadSemester,
  ownStudents,
  parseId,
  reportRange,
} from './attendance.scope.js';

// FE-12 Attendance (owner: Quoc): UC-92 View Student Attendance, UC-93 View Class Attendance (+ export),
// UC-94 View School Attendance Statistics (+ export). Business rules §12 points 7–9.
// "Held" periods = periods that have started (date + start time <= now); only those can have attendance.

const COUNT_COLUMNS = (a) => `COUNT(${a}.attendance_id) AS "records",
  COUNT(*) FILTER (WHERE ${a}.status = 'PRESENT') AS "present",
  COUNT(*) FILTER (WHERE ${a}.status = 'LATE') AS "late",
  COUNT(*) FILTER (WHERE ${a}.status = 'ABSENT_EXCUSED') AS "excused",
  COUNT(*) FILTER (WHERE ${a}.status = 'ABSENT_UNEXCUSED') AS "unexcused"`;

// Present rate = (present + late) / records, one decimal; null without records.
// ASSUMPTION: a late student counts as present in the rate (they attended the period); late is also shown apart.
const rate = (r) => (Number(r.records) ? Math.round(((Number(r.present) + Number(r.late)) * 1000) / Number(r.records)) / 10 : null);

const safeName = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

async function semesterOf(query) {
  if (query.semesterId) return loadSemester(pool, query.semesterId);
  const { rows } = await pool.query(
    `SELECT semester_id FROM semesters WHERE start_date <= ${TODAY_SQL} ORDER BY start_date DESC LIMIT 1`,
  );
  if (!rows[0]) throw notFound('MSG_SEMESTER_NOT_FOUND', 'Semester not found.');
  return loadSemester(pool, rows[0].semester_id);
}

// --- UC-93 class report --------------------------------------------------------------------------------------------

async function classReportData(classId, query, user) {
  const ctx = await contextOf(user);
  const cls = await loadClass(pool, classId);
  const subjectIds = await classSubjectScope(pool, ctx, cls);
  const semester = await semesterOf(query);
  if (String(semester.schoolYearId) !== String(cls.schoolYearId)) {
    throw badRequest('MSG_SEMESTER_CLASS_MISMATCH', 'This semester is not in the class’s school year.');
  }
  const { from, to } = reportRange(semester, query);
  const lessons = `SELECT ts.timetable_slot_id FROM timetable_slots ts JOIN time_slots sl ON sl.slot_id = ts.slot_id
     WHERE ts.class_id = $1 AND ts."date" BETWEEN $2::date AND $3::date AND ${LESSON_START_SQL} <= NOW()
       AND ($4::bigint[] IS NULL OR ts.subject_id = ANY($4::bigint[]))`;
  const params = [cls.classId, from, to, subjectIds];
  const { rows: totals } = await pool.query(
    `SELECT COUNT(*) AS "held",
            COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = l.timetable_slot_id)) AS "taken"
     FROM (${lessons}) l`,
    params,
  );
  const { rows: students } = await pool.query(
    `SELECT e.enrollment_id AS "enrollmentId", e.status AS "enrollmentStatus", s.student_id AS "studentId",
            s.student_code AS "studentCode", u.full_name AS "fullName", ${COUNT_COLUMNS('a')}
     FROM class_enrollments e
     JOIN students s ON s.student_id = e.student_id
     JOIN users u ON u.user_id = s.user_id
     LEFT JOIN attendances a ON a.enrollment_id = e.enrollment_id AND a.timetable_slot_id IN (${lessons})
     WHERE e.class_id = $1
     GROUP BY e.enrollment_id, s.student_id, u.full_name
     HAVING e.status = 'STUDYING' OR COUNT(a.attendance_id) > 0
     ORDER BY (e.status <> 'STUDYING'), ${vietnameseNameOrder('u.full_name')}, e.enrollment_id`,
    params,
  );
  return {
    class: cls,
    semester,
    from,
    to,
    scope: subjectIds === null ? 'ALL' : 'SUBJECTS',
    held: totals[0].held,
    taken: totals[0].taken,
    students: students.map((r) => ({ ...r, presentRate: rate(r) })),
    lessonsSql: lessons,
    params,
  };
}

// GET /attendances/classes/:classId/report?semesterId&from&to
export async function classReport(classId, query, user) {
  const { lessonsSql, params, ...data } = await classReportData(classId, query, user);
  return data;
}

// GET /attendances/classes/:classId/report/export – sheet 1 per student, sheet 2 every period that was not "present".
export async function exportClassReport(classId, query, user) {
  const data = await classReportData(classId, query, user);
  const { rows: details } = await pool.query(
    `SELECT to_char(ts."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period", sj.subject_name AS "subjectName",
            s.student_code AS "studentCode", u.full_name AS "fullName", a.status, a.note
     FROM attendances a
     JOIN timetable_slots ts ON ts.timetable_slot_id = a.timetable_slot_id
     JOIN time_slots sl ON sl.slot_id = ts.slot_id
     JOIN subjects sj ON sj.subject_id = ts.subject_id
     JOIN class_enrollments e ON e.enrollment_id = a.enrollment_id
     JOIN students s ON s.student_id = e.student_id JOIN users u ON u.user_id = s.user_id
     WHERE a.status <> 'PRESENT' AND a.timetable_slot_id IN (${data.lessonsSql})
     ORDER BY ts."date", sl.period_number, ${vietnameseNameOrder('u.full_name')}`,
    data.params,
  );
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Tổng hợp');
  sum.addRow([`Điểm danh lớp ${data.class.className} – Học kỳ ${data.semester.semesterNo}, năm học ${data.semester.yearName}`]);
  sum.addRow([`Từ ${dmy(data.from)} đến ${dmy(data.to)}${data.scope === 'SUBJECTS' ? ' – chỉ các môn bạn dạy' : ''}`]);
  sum.addRow([`Số tiết đã diễn ra: ${data.held}; đã điểm danh: ${data.taken}`]);
  sum.addRow([]);
  const head = sum.addRow(['STT', 'Mã học sinh', 'Họ và tên', 'Trạng thái', 'Số tiết ghi nhận', 'Có mặt', 'Đi muộn', 'Vắng có phép', 'Vắng không phép', 'Tỷ lệ có mặt (%)']);
  head.font = { bold: true };
  data.students.forEach((s, i) =>
    sum.addRow([
      i + 1,
      s.studentCode,
      s.fullName,
      s.enrollmentStatus === 'STUDYING' ? 'Đang học' : 'Đã rời lớp',
      s.records,
      s.present,
      s.late,
      s.excused,
      s.unexcused,
      s.presentRate ?? '',
    ]),
  );
  sum.columns.forEach((c, i) => {
    c.width = [6, 14, 28, 12, 16, 10, 10, 14, 16, 16][i];
  });
  const det = wb.addWorksheet('Chi tiết vắng, muộn');
  det.addRow(['Ngày', 'Tiết', 'Môn', 'Mã học sinh', 'Họ và tên', 'Trạng thái', 'Ghi chú']).font = { bold: true };
  details.forEach((d) => det.addRow([dmy(d.date), d.period, d.subjectName, d.studentCode, d.fullName, STATUS_LABELS[d.status], d.note ?? '']));
  det.columns.forEach((c, i) => {
    c.width = [12, 6, 24, 14, 28, 16, 40][i];
  });
  return { workbook: wb, filename: `diem-danh-${safeName(data.class.className)}-${data.from}-${data.to}.xlsx` };
}

// --- UC-92 one student ---------------------------------------------------------------------------------------------

// GET /attendances/students – the student themself or the parent's linked children (SCR-53 picker).
export async function myStudents(user) {
  return { items: await ownStudents(pool, user) };
}

/**
 * GET /attendances/students/:studentId?semesterId&month=YYYY-MM – totals of the semester and the periods that were
 * not "present" (month filter). Student: self; parent: linked child; teacher: a student of a class they teach or
 * lead (subject teachers: only their subjects); School Manager: anyone. Anything else = "not found".
 */
export async function studentAttendance(studentId, query, user) {
  const ctx = await contextOf(user);
  const id = parseId(studentId, 'MSG_STUDENT_NOT_FOUND', 'Student not found.');
  if (ctx.role === 'STUDENT' || ctx.role === 'PARENT') {
    const own = await ownStudents(pool, user);
    if (!own.some((s) => Number(s.studentId) === id)) throw notFound('MSG_STUDENT_NOT_FOUND', 'Student not found.');
  } else if (ctx.role === 'TEACHER') {
    const { rows } = await pool.query(
      `SELECT 1 FROM class_enrollments e JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
       WHERE e.student_id = $1 AND (c.homeroom_teacher_id = $2 OR EXISTS (SELECT 1 FROM teaching_assignments ta
             WHERE ta.class_id = c.class_id AND ta.teacher_id = $2 AND ta.deleted_at IS NULL)) LIMIT 1`,
      [id, ctx.teacherId ?? -1],
    );
    if (!rows.length) throw notFound('MSG_STUDENT_NOT_FOUND', 'Student not found.');
  } else if (ctx.role !== 'SCHOOL_MANAGER') {
    throw notFound('MSG_STUDENT_NOT_FOUND', 'Student not found.');
  }
  const month = query.month ? String(query.month) : null;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw badRequest('MSG_INVALID_DATE', 'Invalid month.');
  const semester = await semesterOf(query);
  const { rows: info } = await pool.query(
    `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName",
            (SELECT c.class_name FROM class_enrollments e JOIN classes c ON c.class_id = e.class_id
             WHERE e.student_id = s.student_id AND c.school_year_id = $2 AND c.deleted_at IS NULL
             ORDER BY (e.status = 'STUDYING') DESC, e.enrolled_at DESC LIMIT 1) AS "className"
     FROM students s JOIN users u ON u.user_id = s.user_id WHERE s.student_id = $1`,
    [id, semester.schoolYearId],
  );
  if (!info[0]) throw notFound('MSG_STUDENT_NOT_FOUND', 'Student not found.');
  // A teacher sees only the periods of their subjects (homeroom: the whole class), §12 point 7.
  const scope = `($4::bigint IS NULL
      OR EXISTS (SELECT 1 FROM classes c2 WHERE c2.class_id = ts.class_id AND c2.homeroom_teacher_id = $4)
      OR EXISTS (SELECT 1 FROM teaching_assignments ta WHERE ta.class_id = ts.class_id AND ta.subject_id = ts.subject_id
                 AND ta.teacher_id = $4 AND ta.deleted_at IS NULL))`;
  const base = `FROM attendances a
     JOIN class_enrollments e ON e.enrollment_id = a.enrollment_id
     JOIN timetable_slots ts ON ts.timetable_slot_id = a.timetable_slot_id
     JOIN time_slots sl ON sl.slot_id = ts.slot_id
     WHERE e.student_id = $1 AND ts."date" BETWEEN $2::date AND $3::date AND ${scope}`;
  const params = [id, semester.startDate, semester.endDate, ctx.role === 'TEACHER' ? ctx.teacherId ?? -1 : null];
  const { rows: totals } = await pool.query(`SELECT ${COUNT_COLUMNS('a')} ${base}`, params);
  const { rows: records } = await pool.query(
    `SELECT a.attendance_id AS "attendanceId", to_char(ts."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period",
            to_char(sl.start_time, 'HH24:MI') AS "start", to_char(sl.end_time, 'HH24:MI') AS "end",
            sj.subject_name AS "subjectName", c.class_name AS "className", a.status, a.note,
            COALESCE(a.updated_at, a.taken_at) AS "updatedAt"
     ${base.replace('JOIN time_slots sl ON sl.slot_id = ts.slot_id', `JOIN time_slots sl ON sl.slot_id = ts.slot_id
       JOIN subjects sj ON sj.subject_id = ts.subject_id JOIN classes c ON c.class_id = ts.class_id`)}
       AND a.status <> 'PRESENT' AND ($5::text IS NULL OR to_char(ts."date", 'YYYY-MM') = $5)
     ORDER BY ts."date" DESC, sl.period_number DESC`,
    [...params, month],
  );
  return {
    student: info[0],
    semester,
    month,
    totals: { ...totals[0], presentRate: rate(totals[0]) },
    records,
  };
}

// --- UC-94 school statistics ---------------------------------------------------------------------------------------

async function statsFilter(query) {
  const semester = await semesterOf(query);
  const { from, to } = reportRange(semester, query);
  const gradeLevelId = query.gradeLevelId ? parseId(query.gradeLevelId, 'NOT_FOUND', 'Grade level not found.') : null;
  return { semester, from, to, gradeLevelId };
}

// Started periods of the semester's classes in the range ($1 from, $2 to, $3 school year, $4 grade level or null).
const STATS_LESSONS = `SELECT ts.timetable_slot_id, ts.class_id, ts."date", ts.subject_id, ts.slot_id, ts.teacher_id
  FROM timetable_slots ts
  JOIN time_slots sl ON sl.slot_id = ts.slot_id
  JOIN classes c ON c.class_id = ts.class_id AND c.deleted_at IS NULL
  WHERE ts."date" BETWEEN $1::date AND $2::date AND c.school_year_id = $3
    AND ($4::bigint IS NULL OR c.grade_level_id = $4) AND ${LESSON_START_SQL} <= NOW()`;

async function statsRows(f) {
  const { rows } = await pool.query(
    `WITH les AS (${STATS_LESSONS}),
     agg AS (
       SELECT les.class_id, COUNT(DISTINCT les.timetable_slot_id) AS held, COUNT(DISTINCT a.timetable_slot_id) AS taken,
              ${COUNT_COLUMNS('a')}
       FROM les LEFT JOIN attendances a ON a.timetable_slot_id = les.timetable_slot_id
       GROUP BY les.class_id)
     SELECT c.class_id AS "classId", c.class_name AS "className", g.grade_level_name AS "gradeLevelName",
            (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id = c.class_id AND e.status = 'STUDYING') AS "students",
            COALESCE(agg.held, 0) AS "held", COALESCE(agg.taken, 0) AS "taken", COALESCE(agg.records, 0) AS "records",
            COALESCE(agg.present, 0) AS "present", COALESCE(agg.late, 0) AS "late",
            COALESCE(agg.excused, 0) AS "excused", COALESCE(agg.unexcused, 0) AS "unexcused"
     FROM classes c JOIN grade_levels g ON g.grade_level_id = c.grade_level_id
     LEFT JOIN agg ON agg.class_id = c.class_id
     WHERE c.deleted_at IS NULL AND c.school_year_id = $3 AND ($4::bigint IS NULL OR c.grade_level_id = $4)
     ORDER BY g.grade_level_name, c.class_name`,
    [f.from, f.to, f.semester.schoolYearId, f.gradeLevelId],
  );
  return rows.map((r) => ({ ...r, presentRate: rate(r) }));
}

const totalsOf = (rows) => {
  const t = rows.reduce(
    (acc, r) => {
      for (const k of ['students', 'held', 'taken', 'records', 'present', 'late', 'excused', 'unexcused']) acc[k] += Number(r[k]);
      return acc;
    },
    { students: 0, held: 0, taken: 0, records: 0, present: 0, late: 0, excused: 0, unexcused: 0 },
  );
  return { ...t, presentRate: rate(t) };
};

// GET /attendances/stats?semesterId&from&to&gradeLevelId
export async function schoolStats(query) {
  const f = await statsFilter(query);
  const classes = await statsRows(f);
  return { semester: f.semester, from: f.from, to: f.to, gradeLevelId: f.gradeLevelId, classes, totals: totalsOf(classes) };
}

// Started periods without any attendance; overdue = the subject teacher's deadline of that day has passed.
async function missingRows(f, { limit, offset }) {
  const deadline = await deadlineTime();
  const { rows } = await pool.query(
    `WITH les AS (${STATS_LESSONS})
     SELECT les.timetable_slot_id AS "lessonId", to_char(les."date", 'YYYY-MM-DD') AS "date", sl.period_number AS "period",
            to_char(sl.start_time, 'HH24:MI') AS "start", c.class_id AS "classId", c.class_name AS "className",
            sj.subject_name AS "subjectName", tu.full_name AS "teacherName",
            NOW() > ((les."date" + $5::time + INTERVAL '59 seconds') AT TIME ZONE '${TZ}') AS "overdue",
            COUNT(*) OVER () AS "total"
     FROM les
     JOIN time_slots sl ON sl.slot_id = les.slot_id
     JOIN classes c ON c.class_id = les.class_id
     JOIN subjects sj ON sj.subject_id = les.subject_id
     JOIN teachers t ON t.teacher_id = les.teacher_id JOIN users tu ON tu.user_id = t.user_id
     WHERE NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = les.timetable_slot_id)
     ORDER BY les."date" DESC, c.class_name, sl.period_number
     LIMIT $6 OFFSET $7`,
    [f.from, f.to, f.semester.schoolYearId, f.gradeLevelId, deadline, limit, offset],
  );
  return { total: rows[0]?.total ?? 0, items: rows.map(({ total, ...r }) => r) };
}

// GET /attendances/stats/missing?semesterId&from&to&gradeLevelId&page&pageSize
export async function missingLessons(query) {
  const f = await statsFilter(query);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20));
  const data = await missingRows(f, { limit: pageSize, offset: (page - 1) * pageSize });
  return { ...data, page, pageSize };
}

// GET /attendances/stats/export – sheet 1 per class (+ total), sheet 2 the periods not taken.
export async function exportStats(query) {
  const f = await statsFilter(query);
  const classes = await statsRows(f);
  const totals = totalsOf(classes);
  const missing = await missingRows(f, { limit: 5000, offset: 0 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Theo lớp');
  ws.addRow([`Thống kê điểm danh – Học kỳ ${f.semester.semesterNo}, năm học ${f.semester.yearName}`]);
  ws.addRow([`Từ ${dmy(f.from)} đến ${dmy(f.to)}`]);
  ws.addRow([]);
  ws.addRow(['Khối', 'Lớp', 'Sĩ số', 'Tiết đã diễn ra', 'Tiết đã điểm danh', 'Có mặt', 'Đi muộn', 'Vắng có phép', 'Vắng không phép', 'Tỷ lệ có mặt (%)']).font = { bold: true };
  const line = (r, grade, name) => [grade, name, r.students, r.held, r.taken, r.present, r.late, r.excused, r.unexcused, r.presentRate ?? ''];
  classes.forEach((r) => ws.addRow(line(r, r.gradeLevelName, r.className)));
  ws.addRow(line(totals, '', 'Toàn bộ')).font = { bold: true };
  ws.columns.forEach((c, i) => {
    c.width = [8, 12, 8, 16, 18, 10, 10, 14, 16, 16][i];
  });
  const ms = wb.addWorksheet('Tiết chưa điểm danh');
  ms.addRow(['Ngày', 'Tiết', 'Lớp', 'Môn', 'Giáo viên', 'Tình trạng']).font = { bold: true };
  missing.items.forEach((m) => ms.addRow([dmy(m.date), m.period, m.className, m.subjectName, m.teacherName, m.overdue ? 'Quá hạn' : 'Còn trong hạn']));
  ms.columns.forEach((c, i) => {
    c.width = [12, 6, 10, 24, 26, 14][i];
  });
  return { workbook: wb, filename: `thong-ke-diem-danh-HK${f.semester.semesterNo}-${f.from}-${f.to}.xlsx` };
}
