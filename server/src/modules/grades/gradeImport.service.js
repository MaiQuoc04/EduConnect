import ExcelJS from 'exceljs';
import { badRequest, forbidden } from '../../utils/AppError.js';
import { conflict } from './grades.scope.js';
import { assertXlsx, readSheet } from '../../utils/excel.js';
import { parseScore } from './grades.calc.js';
import { applyChanges, getBook } from './gradebook.service.js';

// FE-11 (owner: Linh) – UC-84 Import Grades: the teacher downloads the grade book of a class × subject × semester as
// Excel (filled with the current scores), edits it and uploads it. Preview first; the import is all or nothing.
// ASSUMPTION (FE-11 owner, 10/11/2026, to confirm): an empty score cell keeps the current score; clearing a score is
// done on the grade entry screen (UC-83).

const MAX_ROWS = 200;
const CODE_HEADER = 'Mã học sinh';

// Column header of one score: "TX 1", "TX 2"… when the component has several scores, else its name ("GK").
const scoreHeader = (component, attemptNo) =>
  component.scoreCount > 1 ? `${component.name} ${attemptNo}` : component.name;

function scoreColumns(components) {
  const columns = [];
  for (const c of components) {
    for (let a = 1; a <= c.scoreCount; a += 1) {
      columns.push({ key: `s_${c.componentId}_${a}`, header: scoreHeader(c, a), componentId: c.componentId, attemptNo: a });
    }
  }
  return columns;
}

const slug = (text) =>
  String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

// Import needs the same rights as UC-83: assigned teacher, book not finalized, structure configured.
function assertEditable(book) {
  if (!book.assigned) throw forbidden('MSG_GRADES_NOT_ASSIGNED', 'You are not assigned to teach this subject in this class.');
  if (book.lock.status === 'LOCKED') {
    throw conflict('MSG_GRADES_FINALIZED', 'These grades are finalized. Ask the School Manager to unlock them.');
  }
  if (!book.components.length) throw conflict('MSG_STRUCTURE_EMPTY', 'This subject has no grade structure yet.');
}

// UC-84 step 1: the template = the grade book of the studying students, with their current scores.
export async function buildTemplate(params, user) {
  const book = await getBook(params, user);
  assertEditable(book);
  const columns = scoreColumns(book.components);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Diem');
  sheet.columns = [
    { header: 'STT', key: 'no', width: 6 },
    { header: CODE_HEADER, key: 'code', width: 14 },
    { header: 'Họ và tên', key: 'name', width: 28 },
    ...columns.map((c) => ({ header: c.header, key: c.key, width: 9 })),
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  book.students
    .filter((s) => s.status === 'STUDYING')
    .forEach((s, i) => {
      const row = { no: i + 1, code: s.studentCode, name: s.fullName };
      for (const sc of s.scores) if (sc.score !== null) row[`s_${sc.componentId}_${sc.attemptNo}`] = sc.score;
      sheet.addRow(row);
    });

  const help = workbook.addWorksheet('Huong dan');
  help.getColumn(1).width = 110;
  [
    `Sổ điểm ${book.subject.subjectName} – lớp ${book.class.className} – học kỳ ${book.semester.semesterNo}, năm học ${book.semester.yearName}`,
    'Không đổi tên, thứ tự hay xoá các cột tiêu đề. Có thể xoá các cột STT, Họ và tên.',
    'Điểm từ 0 đến 10, tối đa 2 chữ số thập phân (dấu chấm hoặc dấu phẩy), ví dụ 8 hoặc 7,5.',
    'Ô để trống: giữ nguyên điểm đang có. Muốn xoá một điểm, hãy xoá trên màn hình Nhập điểm.',
    'Chỉ học sinh đang học trong lớp mới được nhập; mã học sinh phải đúng với danh sách lớp.',
    `Các cột điểm: ${book.components.map((c) => `${c.name} (hệ số ${c.weight}, ${c.scoreCount} lần)`).join('; ')}.`,
  ].forEach((line, i) => {
    help.addRow([line]).font = i === 0 ? { bold: true, size: 13 } : {};
  });

  const filename = `diem-${slug(book.class.className)}-${slug(book.subject.subjectCode)}-hk${book.semester.semesterNo}.xlsx`;
  return { workbook, filename };
}

// Reads the uploaded file against the grade book as it is now. Returns one entry per data row.
function analyse(rows, { components, enrollments, scores }) {
  const columns = scoreColumns(components);
  const studying = new Map(enrollments.filter((e) => e.status === 'STUDYING').map((e) => [e.studentCode.toUpperCase(), e]));
  const current = new Map(scores.map((s) => [`${s.enrollmentId}:${s.componentId}:${s.attemptNo}`, s.score]));
  const seen = new Set();
  return rows.map(({ row, values }) => {
    const code = values.code.trim().toUpperCase();
    const enrollment = studying.get(code);
    const errors = [];
    const changes = [];
    if (!code) errors.push({ code: 'CODE_REQUIRED' });
    else if (!enrollment) errors.push({ code: 'CODE_UNKNOWN', value: values.code });
    else if (seen.has(code)) errors.push({ code: 'CODE_DUPLICATE', value: values.code });
    if (code) seen.add(code);
    for (const col of columns) {
      const text = values[col.key];
      const parsed = parseScore(text);
      if (!parsed.ok) {
        errors.push({ code: 'SCORE_INVALID', column: col.header, value: text });
        continue;
      }
      if (parsed.value === null || !enrollment) continue; // empty cell = keep
      const old = current.get(`${enrollment.enrollmentId}:${col.componentId}:${col.attemptNo}`);
      const oldValue = old === null || old === undefined ? null : Number(old);
      if (oldValue !== parsed.value) {
        changes.push({
          column: col.header,
          old: oldValue,
          score: parsed.value,
          enrollmentId: enrollment.enrollmentId,
          componentId: col.componentId,
          attemptNo: col.attemptNo,
        });
      }
    }
    return { row, studentCode: values.code, fullName: enrollment?.fullName ?? null, errors, changes };
  });
}

async function readUpload(file, components) {
  assertXlsx(file);
  const columns = { code: CODE_HEADER };
  for (const c of scoreColumns(components)) columns[c.key] = c.header;
  return readSheet(file.buffer, columns, { maxRows: MAX_ROWS });
}

const summary = (analysed) => ({
  rows: analysed.map(({ row, studentCode, fullName, errors, changes }) => ({
    row,
    studentCode,
    fullName,
    errors,
    changes: changes.map(({ column, old, score }) => ({ column, old, score })),
  })),
  errorCount: analysed.filter((r) => r.errors.length).length,
  changeCount: analysed.reduce((n, r) => n + r.changes.length, 0),
});

// UC-84 step 2: preview – what would change, and the rows with errors. Nothing is saved.
export async function previewImport(params, file, user) {
  const book = await getBook(params, user);
  assertEditable(book);
  const rows = await readUpload(file, book.components);
  const scores = book.students.flatMap((s) => s.scores.map((sc) => ({ ...sc, enrollmentId: s.enrollmentId })));
  return summary(analyse(rows, { components: book.components, enrollments: book.students, scores }));
}

// UC-84 step 3: import. The file is read first (ExcelJS is async), then checked again against the grade book INSIDE
// the transaction (another save may have happened since the preview); any error = nothing is saved.
export async function importGrades(params, file, user) {
  const book = await getBook(params, user);
  assertEditable(book);
  const rows = await readUpload(file, book.components);
  const { changed } = await applyChanges(params, user, (ctx) => {
    const analysed = analyse(rows, ctx);
    const errorCount = analysed.filter((r) => r.errors.length).length;
    if (errorCount) {
      throw badRequest('MSG_IMPORT_HAS_ERRORS', 'Some rows have errors. Fix the file and try again.', { errorCount });
    }
    const changes = analysed.flatMap((r) => r.changes);
    if (!changes.length) throw badRequest('MSG_GRADES_NO_CHANGE', 'The file does not change any score.');
    return changes;
  });
  return { changed, book: await getBook(params, user) };
}
