import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { assertXlsx, readSheet } from '../../utils/excel.js';
import {
  classNameProblem,
  conflict,
  enrollAndSyncGroups,
  lockOpenYear,
  normalizeClassName,
  resolveYear,
} from './classes.service.js';

// UC-27 Import Class List (SCR-22). One row per student: class name, grade, class type, student code. Accounts
// must already exist (business-rules §3). Two steps: preview (no write) and import (the same file again, checked
// again, all rows or nothing). New classes get their three groups (business-rules §4); a class that already exists
// in the year only gets the new students (agreed 27/10).

const COLUMNS = { className: 'Tên lớp', grade: 'Khối', track: 'Loại lớp', studentCode: 'Mã học sinh' };
const MAX_ROWS = 2000; // ASSUMPTION: about 40 classes × 45 students

const fold = (text) => String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Checks every row against the database. db = pool (preview) or the transaction client (import).
// Returns { classes, errors, warnings, plan }. errors / warnings = [{ row, code, value? }] (row = Excel row number).
async function analyze(db, year, rows) {
  const errors = [];
  const warnings = [];
  const add = (list, row, code, value) => list.push(value === undefined ? { row, code } : { row, code, value });

  const items = rows.map(({ row, values }) => ({
    row,
    className: normalizeClassName(values.className),
    grade: values.grade.replace(/\s+/g, ''),
    track: values.track,
    studentCode: values.studentCode.replace(/\s+/g, '').toUpperCase(),
  }));

  const [{ rows: grades }, { rows: tracks }] = await Promise.all([
    db.query('SELECT grade_level_id AS "id", grade_level_name AS "name" FROM grade_levels'),
    db.query('SELECT track_id AS "id", track_name AS "name" FROM class_tracks WHERE deleted_at IS NULL'),
  ]);
  const gradeByName = new Map(grades.map((g) => [g.name, g]));
  const trackByName = new Map(tracks.map((t) => [fold(t.name), t]));

  const names = [...new Set(items.map((i) => i.className).filter(Boolean))];
  const codes = [...new Set(items.map((i) => i.studentCode).filter(Boolean))];
  const [{ rows: existing }, { rows: students }] = await Promise.all([
    db.query(
      `SELECT c.class_id AS "classId", c.class_name AS "className", c.grade_level_id AS "gradeLevelId",
              c.track_id AS "trackId", c.homeroom_teacher_id IS NOT NULL AS "hasHomeroom"
       FROM classes c
       WHERE c.school_year_id = $1 AND c.class_name = ANY($2::text[]) AND c.deleted_at IS NULL`,
      [year.schoolYearId, names],
    ),
    db.query(
      `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName", u.status,
              ARRAY(SELECT sp.parent_id FROM student_parents sp WHERE sp.student_id = s.student_id) AS "parentIds"
       FROM students s JOIN users u ON u.user_id = s.user_id
       WHERE upper(s.student_code) = ANY($1::text[])`,
      [codes],
    ),
  ]);
  const existingByName = new Map(existing.map((c) => [c.className, c]));
  const studentByCode = new Map(students.map((s) => [s.studentCode.toUpperCase(), s]));
  const studentIds = students.map((s) => s.studentId);

  // Where these students are this year: Map studentId -> [{ classId, className, status }].
  const { rows: enrolled } = await db.query(
    `SELECT e.student_id AS "studentId", c.class_id AS "classId", c.class_name AS "className", e.status
     FROM class_enrollments e
     JOIN classes c ON c.class_id = e.class_id AND c.deleted_at IS NULL
     WHERE c.school_year_id = $1 AND e.student_id = ANY($2::bigint[])`,
    [year.schoolYearId, studentIds],
  );
  const enrollments = new Map();
  enrolled.forEach((e) => enrollments.set(e.studentId, [...(enrollments.get(e.studentId) ?? []), e]));

  const plan = new Map(); // className -> class plan
  const seenCodes = new Map(); // studentCode -> first row

  for (const item of items) {
    const { row } = item;
    if (!item.className || !item.grade || !item.track || !item.studentCode) {
      add(errors, row, 'ROW_REQUIRED');
      continue;
    }
    let ok = true;
    const grade = gradeByName.get(item.grade);
    if (!grade) {
      add(errors, row, 'ROW_GRADE_INVALID', item.grade);
      ok = false;
    }
    const track = trackByName.get(fold(item.track));
    if (!track) {
      add(errors, row, 'ROW_TRACK_NOT_FOUND', item.track);
      ok = false;
    }
    const nameProblem = classNameProblem(item.className, grade?.name);
    if (nameProblem) {
      add(errors, row, nameProblem === 'FORMAT' ? 'ROW_CLASS_NAME_FORMAT' : 'ROW_CLASS_NAME_GRADE', item.className);
      ok = false;
    }

    let target = plan.get(item.className);
    if (ok && !target) {
      const old = existingByName.get(item.className);
      if (old && (old.gradeLevelId !== grade.id || old.trackId !== track.id)) {
        add(errors, row, 'ROW_CLASS_EXISTS_DIFFERENT', item.className);
        ok = false;
      } else {
        target = {
          className: item.className,
          gradeLevelId: grade.id,
          gradeLevel: grade.name,
          trackId: track.id,
          trackName: track.name,
          classId: old?.classId ?? null,
          exists: Boolean(old),
          hasHomeroom: Boolean(old?.hasHomeroom),
          studentIds: [],
          skipped: 0,
          parentIds: new Set(),
        };
        plan.set(item.className, target);
      }
    } else if (ok && (target.gradeLevelId !== grade.id || target.trackId !== track.id)) {
      add(errors, row, 'ROW_CLASS_MISMATCH', item.className);
      ok = false;
    }

    const student = studentByCode.get(item.studentCode);
    if (!student) {
      add(errors, row, 'ROW_STUDENT_NOT_FOUND', item.studentCode);
      continue;
    }
    if (seenCodes.has(item.studentCode)) {
      add(errors, row, 'ROW_STUDENT_DUPLICATE', item.studentCode);
      continue;
    }
    seenCodes.set(item.studentCode, row);

    const here = (enrollments.get(student.studentId) ?? []).find((e) => e.className === item.className);
    const elsewhere = (enrollments.get(student.studentId) ?? []).find(
      (e) => e.status === 'STUDYING' && e.className !== item.className,
    );
    if (elsewhere) {
      add(errors, row, 'ROW_STUDENT_IN_OTHER_CLASS', elsewhere.className);
      continue;
    }
    if (here && here.status !== 'STUDYING') {
      add(errors, row, 'ROW_STUDENT_LEFT_CLASS', item.className);
      continue;
    }
    if (!ok) continue;
    if (here) {
      add(warnings, row, 'WARN_ALREADY_IN_CLASS', item.studentCode);
      target.skipped += 1;
      continue;
    }
    // ASSUMPTION (agreed 27/10): a locked account is still imported, with a warning (business-rules §3).
    if (student.status === 'LOCKED') add(warnings, row, 'WARN_STUDENT_LOCKED', item.studentCode);
    if (!student.parentIds.length) add(warnings, row, 'WARN_NO_PARENT', item.studentCode);
    target.studentIds.push(student.studentId);
    student.parentIds.forEach((p) => target.parentIds.add(p));
  }

  const classes = [...plan.values()].map((c) => ({
    className: c.className,
    gradeLevel: c.gradeLevel,
    trackName: c.trackName,
    exists: c.exists,
    hasHomeroom: c.hasHomeroom,
    newStudents: c.studentIds.length,
    skipped: c.skipped,
    parents: c.parentIds.size,
  }));
  return { classes, errors, warnings, plan };
}

function summarize(rows, classes) {
  return {
    rows: rows.length,
    newClasses: classes.filter((c) => !c.exists).length,
    existingClasses: classes.filter((c) => c.exists).length,
    students: classes.reduce((sum, c) => sum + c.newStudents, 0),
    parents: classes.reduce((sum, c) => sum + c.parents, 0),
  };
}

async function readFile(file) {
  assertXlsx(file);
  return readSheet(file.buffer, COLUMNS, { maxRows: MAX_ROWS });
}

// UC-27 step 1: check the file without writing anything.
export async function previewImport({ schoolYearId, file }) {
  if (schoolYearId === undefined || schoolYearId === '') throw badRequest('MSG_REQUIRED', 'Please choose a school year.');
  const year = await resolveYear(schoolYearId);
  if (year.ended) throw conflict('MSG_SCHOOL_YEAR_ENDED', 'An ended school year cannot be changed.');
  const rows = await readFile(file);
  const { classes, errors, warnings } = await analyze(pool, year, rows);
  return { schoolYear: year, summary: summarize(rows, classes), classes, errors, warnings };
}

// UC-27 step 2: check again inside a transaction (the year row is locked) and write all rows, or none.
export async function runImport({ schoolYearId, file }, userId) {
  const rows = await readFile(file);
  return withTransaction(async (client) => {
    const year = await lockOpenYear(client, schoolYearId);
    const { classes, errors, warnings, plan } = await analyze(client, year, rows);
    if (errors.length) {
      throw badRequest('MSG_IMPORT_INVALID', 'The file has errors; nothing was imported.', { errors, warnings });
    }
    let memberships = 0;
    for (const c of plan.values()) {
      let { classId } = c;
      if (!classId) {
        const { rows: created } = await client.query(
          `INSERT INTO classes (class_name, grade_level_id, school_year_id, track_id)
           VALUES ($1, $2, $3, $4) RETURNING class_id AS "classId"`,
          [c.className, c.gradeLevelId, year.schoolYearId, c.trackId],
        );
        classId = created[0].classId;
      }
      memberships += await enrollAndSyncGroups(client, {
        classId,
        className: c.className,
        studentIds: c.studentIds,
        createdBy: userId,
      });
    }
    return { schoolYear: year, summary: { ...summarize(rows, classes), memberships }, classes, warnings };
  }).catch((err) => {
    // Two School Managers importing the same class at the same moment.
    if (err.code === '23505') throw conflict('MSG_CLASS_IMPORT_CONFLICT', 'The classes changed meanwhile; please try again.');
    throw err;
  });
}

// UC-27 template: the data sheet first (the only one read back), then instructions and the current class types.
export async function buildTemplate() {
  const { rows: tracks } = await pool.query(
    'SELECT track_name AS "name", description FROM class_tracks WHERE deleted_at IS NULL ORDER BY track_name',
  );
  const workbook = new ExcelJS.Workbook();
  const data = workbook.addWorksheet('Danh sách lớp');
  data.columns = Object.values(COLUMNS).map((header) => ({ header, width: 18 }));
  data.getRow(1).font = { bold: true };

  const help = workbook.addWorksheet('Hướng dẫn');
  help.columns = [{ width: 18 }, { width: 80 }];
  [
    ['Cột', 'Cách nhập'],
    ['Tên lớp', 'Khối viết liền với chữ hoặc số, không dấu, ví dụ 10A1, 11D2.'],
    ['Khối', '10, 11 hoặc 12, trùng với khối trong tên lớp.'],
    ['Loại lớp', 'Một trong các loại lớp ở sheet "Loại lớp".'],
    ['Mã học sinh', 'Mã của tài khoản học sinh đã có trong hệ thống. Mỗi học sinh một dòng.'],
    ['Lưu ý', 'Chỉ sheet đầu tiên được đọc. Mỗi học sinh chỉ học một lớp trong một năm học.'],
  ].forEach((r) => help.addRow(r));
  help.getRow(1).font = { bold: true };

  const types = workbook.addWorksheet('Loại lớp');
  types.columns = [
    { header: 'Loại lớp', width: 18 },
    { header: 'Mô tả', width: 60 },
  ];
  tracks.forEach((t) => types.addRow([t.name, t.description ?? '']));
  types.getRow(1).font = { bold: true };
  return workbook;
}
