// FE-10 UC-72 Import Class Timetable (School Manager). One file holds the weekly pattern of one or more classes:
// one row per lesson (class, weekday, period, subject, room). The range (start, end) is chosen on the screen and
// applies to every class of the file. The file is checked row by row, then every class is saved exactly like the
// editor does (UC-71) inside ONE transaction: the preview rolls it back, the import commits it only when nothing is
// wrong (all or nothing), so clashes between classes of the same file are found too.
import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest, notFound } from '../../utils/AppError.js';
import { foldVietnamese } from '../../utils/search.js';
import { ERROR_CODES, TIMETABLE_LIMITS } from './timetable.constants.js';
import { internals } from './timetable.service.js';

const { classInfo, today, checkRange, saveVersion, timeSlots, classSubjects, guard } = internals;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const COLUMNS = [
  { key: 'className', header: 'Lớp *', width: 10 },
  { key: 'weekday', header: 'Thứ (2–7) *', width: 12 },
  { key: 'period', header: 'Tiết *', width: 8 },
  { key: 'subject', header: 'Môn (mã hoặc tên) *', width: 30 },
  { key: 'room', header: 'Phòng', width: 12 },
];
const REQUIRED = ['className', 'weekday', 'period', 'subject'];
const headerKey = (h) => foldVietnamese(String(h)).replace(/\*/g, '').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');

async function yearById(id) {
  const { rows } = await pool.query(
    `SELECT school_year_id AS "id", year_name AS "name", to_char(start_date, 'YYYY-MM-DD') AS "startDate",
            to_char(end_date, 'YYYY-MM-DD') AS "endDate" FROM school_years WHERE school_year_id = $1`,
    [id],
  );
  if (!rows.length) throw notFound(ERROR_CODES.SCHOOL_YEAR_NOT_FOUND, 'School year not found.');
  return rows[0];
}

async function classesOfYear(yearId, db = pool) {
  const { rows } = await db.query(
    `SELECT c.class_id AS "classId", c.class_name AS "className", c.track_id AS "trackId"
     FROM classes c JOIN grade_levels gl ON gl.grade_level_id = c.grade_level_id
     WHERE c.school_year_id = $1 AND c.deleted_at IS NULL ORDER BY gl.grade_level_name, c.class_name`,
    [yearId],
  );
  return rows;
}

// ── Template (GET /timetables/import/template?schoolYearId=) ────────────────

export function buildTemplate({ schoolYearId }) {
  return guard(async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Thoi khoa bieu');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width, style: { numFmt: '@' } }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const sample = [
      ['10A1', '2', '1', 'HDTN', ''],
      ['10A1', '2', '2', 'TOAN', 'P.201'],
      ['10A1', '2', '3', 'Ngữ văn', 'P.201'],
    ];
    sample.forEach(([className, weekday, period, subject, room]) => ws.addRow({ className, weekday, period, subject, room }));

    const guide = wb.addWorksheet('Huong dan');
    guide.columns = [{ width: 18 }, { width: 70 }];
    const lines = [
      ['Cách điền', 'Mỗi dòng là một tiết trong tuần của một lớp. Một file có thể gồm nhiều lớp.'],
      ['Lớp', 'Tên lớp đúng như trong hệ thống (ví dụ 10A1).'],
      ['Thứ', '2 = thứ Hai … 7 = thứ Bảy (có thể ghi "Thứ 2", "T2"). Chủ nhật không có tiết học.'],
      ['Tiết', 'Số tiết trong ngày (xem bảng giờ bên dưới).'],
      ['Môn', 'Mã môn hoặc tên môn, phải là môn của loại lớp. Giáo viên lấy theo phân công giảng dạy.'],
      ['Phòng', 'Không bắt buộc, tối đa 50 ký tự.'],
      ['Áp dụng', 'Ngày bắt đầu và kết thúc chọn trên màn hình khi nhập file; thời khoá biểu cũ trước ngày bắt đầu giữ nguyên.'],
    ];
    lines.forEach((l) => guide.addRow(l));
    guide.addRow([]);
    guide.addRow(['Tiết', 'Giờ']).font = { bold: true };
    for (const s of await timeSlots()) guide.addRow([`Tiết ${s.period}`, `${s.start} – ${s.end}`]);
    if (schoolYearId) {
      const year = await yearById(schoolYearId);
      guide.addRow([]);
      guide.addRow([`Lớp năm ${year.name}`, 'Mã môn – tên môn (số tiết/tuần)']).font = { bold: true };
      for (const c of await classesOfYear(year.id)) {
        const subjects = await classSubjects({ trackId: c.trackId, schoolYear: { id: year.id } });
        guide.addRow([c.className, subjects.map((s) => `${s.code} – ${s.name} (${s.periodsPerWeek})`).join('; ')]);
      }
    }
    return { fileName: 'mau-thoi-khoa-bieu.xlsx', contentType: XLSX_MIME, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
  });
}

// ── Reading the file ─────────────────────────────────────────────────────────

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) return '';
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('').trim();
    if ('text' in value) return cellText(value.text);
    if ('result' in value) return cellText(value.result);
    return '';
  }
  return String(value).trim();
}

async function readRows(file) {
  const isZip = file?.buffer?.length > 4 && file.buffer.readUInt32LE(0) === 0x04034b50;
  if (!isZip) throw badRequest(ERROR_CODES.IMPORT_FILE, 'Only .xlsx files made from the template can be imported.');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file.buffer);
  } catch {
    throw badRequest(ERROR_CODES.IMPORT_FILE, 'Only .xlsx files made from the template can be imported.');
  }
  const ws = wb.worksheets[0];
  const columnOf = {};
  ws.getRow(1).eachCell((cell, col) => {
    const col0 = COLUMNS.find((c) => headerKey(c.header) === headerKey(cellText(cell.value)));
    if (col0 && !columnOf[col0.key]) columnOf[col0.key] = col;
  });
  const missing = REQUIRED.filter((k) => !columnOf[k]).map((k) => COLUMNS.find((c) => c.key === k).header);
  if (missing.length) throw badRequest(ERROR_CODES.IMPORT_TEMPLATE, 'Required columns are missing.', { missing });
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const values = {};
    for (const [key, col] of Object.entries(columnOf)) values[key] = cellText(row.getCell(col).value);
    if (Object.values(values).every((v) => v === '')) continue;
    rows.push({ row: r, values });
  }
  if (!rows.length) throw badRequest(ERROR_CODES.IMPORT_EMPTY, 'The file has no data rows.');
  if (rows.length > TIMETABLE_LIMITS.IMPORT_MAX_ROWS) {
    throw badRequest(ERROR_CODES.IMPORT_TOO_MANY_ROWS, 'Too many rows.', { max: TIMETABLE_LIMITS.IMPORT_MAX_ROWS });
  }
  return rows;
}

const WEEKDAY_WORDS = { hai: 2, ba: 3, tu: 4, nam: 5, sau: 6, bay: 7 };
// "2", "Thứ 2", "T2", "thứ hai" -> ISO weekday (Monday = 1). Sunday / unknown -> null.
function readWeekday(text) {
  const t = foldVietnamese(text).replace(/\s+/g, ' ').trim();
  const m = /^(?:thu|t)?\s*([2-7])$/.exec(t);
  if (m) return Number(m[1]) - 1;
  const w = /^(?:thu )?(hai|ba|tu|nam|sau|bay)$/.exec(t);
  return w ? WEEKDAY_WORDS[w[1]] - 1 : null;
}

// Row problems use short codes the client turns into Vietnamese (messages.js TT_ROW_*).
async function checkRows(rows, year) {
  const [classes, slots] = await Promise.all([classesOfYear(year.id), timeSlots()]);
  const classByName = new Map(classes.map((c) => [c.className.replace(/\s+/g, '').toUpperCase(), c]));
  const slotByPeriod = new Map(slots.map((s) => [String(s.period), s]));
  const subjectsOf = new Map();
  const problems = [];
  const byClass = new Map();
  const seen = new Map();

  for (const { row, values } of rows) {
    const issues = [];
    const cls = classByName.get(values.className.replace(/\s+/g, '').toUpperCase());
    if (!values.className) issues.push({ field: 'className', code: 'TT_ROW_REQUIRED' });
    else if (!cls) issues.push({ field: 'className', code: 'TT_ROW_CLASS_NOT_FOUND', value: values.className });

    const weekday = values.weekday ? readWeekday(values.weekday) : null;
    if (!values.weekday) issues.push({ field: 'weekday', code: 'TT_ROW_REQUIRED' });
    else if (!weekday) issues.push({ field: 'weekday', code: 'TT_ROW_WEEKDAY', value: values.weekday });

    const slot = slotByPeriod.get(String(Number(values.period)));
    if (!values.period) issues.push({ field: 'period', code: 'TT_ROW_REQUIRED' });
    else if (!/^\d{1,2}$/.test(values.period) || !slot) issues.push({ field: 'period', code: 'TT_ROW_PERIOD', value: values.period });

    let subject = null;
    if (!values.subject) issues.push({ field: 'subject', code: 'TT_ROW_REQUIRED' });
    else if (cls) {
      if (!subjectsOf.has(cls.classId)) subjectsOf.set(cls.classId, await classSubjects({ trackId: cls.trackId, schoolYear: { id: year.id } }));
      const key = foldVietnamese(values.subject).replace(/\s+/g, ' ').trim();
      subject = subjectsOf.get(cls.classId).find((s) => s.code.toLowerCase() === key.replace(/\s/g, '') || foldVietnamese(s.name) === key) ?? null;
      if (!subject) issues.push({ field: 'subject', code: 'TT_ROW_SUBJECT', value: values.subject, className: cls.className });
    }
    const room = (values.room ?? '').replace(/\s+/g, ' ').trim();
    if (room.length > TIMETABLE_LIMITS.ROOM_MAX) issues.push({ field: 'room', code: 'TT_ROW_ROOM' });

    if (cls && weekday && slot) {
      const key = `${cls.classId}-${weekday}-${slot.slotId}`;
      if (seen.has(key)) issues.push({ field: 'period', code: 'TT_ROW_DUPLICATE', otherRow: seen.get(key) });
      else seen.set(key, row);
    }
    if (issues.length) problems.push({ row, values, issues });
    else {
      if (!byClass.has(cls.classId)) byClass.set(cls.classId, { classId: cls.classId, className: cls.className, entries: [] });
      byClass.get(cls.classId).entries.push({ weekday, slotId: String(slot.slotId), subjectId: String(subject.subjectId), room: room || null });
    }
  }
  return { problems, classes: [...byClass.values()] };
}

class Rollback extends Error {}

// Runs the whole import in one transaction. commit = false (preview) always rolls back.
async function run({ schoolYearId, startDate, endDate, file }, user, { commit }) {
  const year = await yearById(schoolYearId);
  const rows = await readRows(file);
  const { problems, classes } = await checkRows(rows, year);
  const results = [];

  const work = async (db) => {
    const day = await today(db);
    // The classes of the file are planned again together: first remove their own periods of the range (those without
    // attendance, as saveVersion does), so a teacher moved between two classes of the file is not reported as clashing
    // with the old timetable of the other class. Range problems are reported by the loop below.
    const removedFirst = new Map();
    for (const c of classes) {
      try {
        const cls = await classInfo(c.classId, db, { lock: true });
        const { start, end } = checkRange(cls, day, startDate, endDate);
        const { rows: gone } = await db.query(
          `WITH gone AS (
             DELETE FROM timetable_slots ts WHERE ts.class_id = $1 AND ts."date" BETWEEN $2::date AND $3::date
               AND NOT EXISTS (SELECT 1 FROM attendances a WHERE a.timetable_slot_id = ts.timetable_slot_id)
             RETURNING 1)
           SELECT COUNT(*)::int AS n FROM gone`,
          [c.classId, start, end],
        );
        removedFirst.set(c.classId, gone[0].n);
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }
    for (const c of classes) {
      await db.query('SAVEPOINT class_import');
      try {
        const cls = await classInfo(c.classId, db, { lock: true });
        const { start, end } = checkRange(cls, day, startDate, endDate);
        const saved = await saveVersion(db, { cls, start, end, entries: c.entries, userId: user.userId });
        await db.query('RELEASE SAVEPOINT class_import');
        results.push({
          classId: c.classId, className: c.className, periodsPerWeek: c.entries.length, ok: true, ...saved,
          removed: saved.removed + (removedFirst.get(c.classId) ?? 0), startDate: start, endDate: end,
        });
      } catch (err) {
        await db.query('ROLLBACK TO SAVEPOINT class_import');
        if (!(err instanceof AppError)) throw err;
        results.push({ classId: c.classId, className: c.className, periodsPerWeek: c.entries.length, ok: false, error: { code: err.code, details: err.details } });
      }
    }
    const ok = problems.length === 0 && results.every((r) => r.ok);
    if (!commit || !ok) throw new Rollback();
  };

  let committed = false;
  try {
    await guard(() => withTransaction(work));
    committed = true;
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  const summary = {
    schoolYear: year,
    startDate,
    endDate: endDate ?? year.endDate,
    rows: rows.length,
    validRows: rows.length - problems.length,
    problems,
    classes: results,
    ok: problems.length === 0 && results.every((r) => r.ok),
  };
  if (commit && !committed) {
    throw new AppError(409, ERROR_CODES.IMPORT_HAS_ERRORS, 'The file still has errors; nothing was saved.', summary);
  }
  return { ...summary, saved: committed };
}

export const previewImport = (input, user) => run(input, user, { commit: false });
export const importTimetables = (input, user) => run(input, user, { commit: true });
