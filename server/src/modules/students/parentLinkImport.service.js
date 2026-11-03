import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { badRequest } from '../../utils/AppError.js';
import { cellText } from '../../utils/excel.js';
import { normalizePhone, PHONE_RE } from '../../utils/phone.js';
import { removeAccents } from '../../utils/username.js';
import { MAX_PARENTS_PER_STUDENT, saveParentLinks } from './students.service.js';

// UC-14 Import Parent–Student Links (FE-02, owner: Anh), SCR-07 Student List. School Manager only.
// Business-rules §4 "Import parent–student links (UC-14)": works like the account import (UC-96, FE-13) – a
// template (.xlsx or .csv) with the columns Mã học sinh, Số điện thoại phụ huynh, Quan hệ; headers matched ignoring
// accents, case and notes; at most 500 rows. Preview writes nothing and lists each row's errors; import checks the
// same file again from the start (nothing is kept between the two calls) and saves every valid row in one
// transaction – invalid rows are skipped and listed; no valid row → refused. Only EXISTING parent accounts are
// linked (accounts are created by UC-95 / UC-96, FE-13). Not logged (like UC-13).
//
// Reading the file follows FE-13's accountImport.service.js (UC-96): the same .xlsx / .csv detection, the same
// header matching (without accents, case, notes in brackets or "*") and the same file-level error codes. Its
// helpers are not exported and FE-13 is Linh's module, so they are mirrored here; utils/excel.js (FE-04) is reused
// for cellText. Proposal for the lead: move loadWorksheet / headerKey of UC-96 into utils/excel.js so both share one.

const MAX_ROWS = 500;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Columns of the template, in order. All three are required.
const COLUMNS = [
  { key: 'studentCode', header: 'Mã học sinh', note: 'HS + 4 số', width: 18 },
  { key: 'phone', header: 'Số điện thoại phụ huynh', width: 26 },
  { key: 'relationship', header: 'Quan hệ', note: 'Bố/Mẹ/Người giám hộ', width: 30 },
];

// Relationship words of the file → student_parents.relationship_type (business-rules §4).
// ASSUMPTION: compared like the headers (without accents, case or spaces), so "me" or "NGUOI GIAM HO" are accepted.
const RELATIONSHIP_WORDS = { bo: 'FATHER', me: 'MOTHER', nguoigiamho: 'GUARDIAN' };

// "Quan hệ (Bố/Mẹ/Người giám hộ) *" -> "quanhe" – the same rule as UC-96 (accountImport.service.js).
const headerKey = (value) =>
  removeAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- template

export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lien ket');
  ws.columns = COLUMNS.map((c) => ({
    header: `${c.header}${c.note ? ` (${c.note})` : ''} *`,
    key: c.key,
    width: c.width,
    style: { numFmt: '@' }, // text cells: keeps the leading 0 of phone numbers
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F1FA' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.addRow({ studentCode: 'HS0001', phone: '0905000041', relationship: 'Bố' }); // example row

  const help = wb.addWorksheet('Huong dan');
  help.columns = [{ width: 110 }];
  [
    'Mẫu nhập liên kết phụ huynh – học sinh – EduConnect',
    'Mỗi dòng của trang "Lien ket" là một liên kết giữa một học sinh và một phụ huynh. Không đổi tên các cột ở dòng 1.',
    'Dòng 2 là dòng ví dụ: hãy xoá hoặc thay bằng dữ liệu thật trước khi nhập.',
    'Mã học sinh gồm HS và 4 chữ số, ví dụ HS0001.',
    'Số điện thoại là số của tài khoản phụ huynh đã có trong hệ thống (10 chữ số, bắt đầu bằng 0). File này không tạo tài khoản mới.',
    'Quan hệ ghi Bố, Mẹ hoặc Người giám hộ.',
    `Mỗi học sinh có tối đa ${MAX_PARENTS_PER_STUDENT} phụ huynh, tính cả các liên kết đã có.`,
    `Tối đa ${MAX_ROWS} dòng mỗi file. Kiểm tra trước, rồi xác nhận nhập: chỉ các dòng hợp lệ được lưu.`,
  ].forEach((line, i) => {
    help.addRow([line]).font = i === 0 ? { bold: true, size: 13 } : {};
  });

  return {
    fileName: 'mau-nhap-lien-ket-phu-huynh.xlsx',
    contentType: XLSX_MIME,
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}

// ---------------------------------------------------------------- reading the file (as UC-96)

function fileError() {
  return badRequest('MSG_IMPORT_FILE', 'Only .xlsx or .csv files made from the template can be imported.');
}

async function loadWorksheet(file) {
  const name = file.originalname ?? '';
  const isXlsxName = /\.xlsx$/i.test(name);
  const isCsvName = /\.csv$/i.test(name);
  if (!isXlsxName && !isCsvName) throw fileError();
  const wb = new ExcelJS.Workbook();
  const isZip = file.buffer.length > 4 && file.buffer.readUInt32LE(0) === 0x04034b50; // .xlsx is a zip file
  try {
    if (isXlsxName && isZip) {
      await wb.xlsx.load(file.buffer);
      return wb.worksheets[0];
    }
    if (isCsvName && !isZip) {
      const content = file.buffer.toString('utf8').replace(/^﻿/, '');
      // map keeps every value as typed (no automatic number / date conversion).
      return await wb.csv.read(Readable.from([content]), { map: (v) => v });
    }
  } catch {
    // fall through: unreadable file
  }
  throw fileError();
}

// Rows of the sheet as { rowNumber, values: { studentCode, phone, relationship } } (text), blank lines skipped.
async function readRows(file) {
  const ws = await loadWorksheet(file);
  if (!ws) throw fileError();

  const columnOf = {};
  ws.getRow(1).eachCell((cell, col) => {
    const key = headerKey(cellText(cell.value));
    const column = COLUMNS.find((c) => headerKey(c.header) === key);
    if (column && !columnOf[column.key]) columnOf[column.key] = col;
  });
  const missing = COLUMNS.filter((c) => !columnOf[c.key]).map((c) => c.header);
  if (missing.length) {
    throw badRequest('MSG_IMPORT_TEMPLATE', 'The file does not follow the template: required columns are missing.', {
      missing,
    });
  }

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const values = {};
    for (const c of COLUMNS) values[c.key] = cellText(row.getCell(columnOf[c.key]).value);
    if (Object.values(values).every((v) => v === '')) continue; // empty line
    rows.push({ rowNumber: r, values });
  }
  if (!rows.length) throw badRequest('MSG_IMPORT_EMPTY', 'The file has no data rows.');
  if (rows.length > MAX_ROWS) {
    throw badRequest('MSG_IMPORT_TOO_MANY_ROWS', `A file can hold at most ${MAX_ROWS} rows.`, { max: MAX_ROWS });
  }
  return rows;
}

// Typed phone → the stored form (business-rules §3, utils/phone.js). As in UC-96, a 9-digit value is a number cell
// whose leading 0 Excel dropped.
function toPhone(text) {
  const phone = normalizePhone(text);
  return /^\d{9}$/.test(phone) ? `0${phone}` : phone;
}

// ---------------------------------------------------------------- checking the rows

const ROW_ERRORS = {
  REQUIRED: ['MSG_REQUIRED', 'Every column of the row must be filled in.'],
  STUDENT_NOT_FOUND: ['MSG_STUDENT_NOT_FOUND', 'No student has this student code.'],
  PARENT_NOT_FOUND: ['MSG_PARENT_PHONE_NOT_FOUND', 'No parent account has this phone number.'],
  RELATIONSHIP: ['MSG_INVALID_RELATIONSHIP_TYPE', 'The relationship must be Bố, Mẹ or Người giám hộ.'],
  LINK_EXISTS: ['MSG_LINK_ALREADY_EXISTS', 'This parent is already linked to the student.'],
  DUPLICATE_IN_FILE: ['MSG_DUPLICATE_LINK_IN_FILE', 'The same student and parent appear on an earlier row of the file.'],
  MAX_PARENTS: ['MSG_MAX_PARENTS_REACHED', `A student can have at most ${MAX_PARENTS_PER_STUDENT} parents.`],
};

// Checks every row against the database through `db` (the pool for the preview, the import's transaction client
// after it locked the students). Preview and import call this same function on the same file, so they give the same
// rows. Errors, first one that applies (the list of business-rules §4, in an order where each later check needs
// the earlier ones to pass):
//   1. a value is missing                      5. the link already exists in the database
//   2. no student with that code               6. the same student–parent pair is on an earlier row of the file
//   3. no parent account with that phone       7. the student would have more than 2 parents
//   4. the relationship is not in the list
// 6 and 7 are counted over the whole file in row order: a student with 1 parent and 2 new rows → the first row is
// valid, the second is refused (1 existing + 1 earlier valid row = 2).
// ASSUMPTION: for 7 only the earlier VALID rows count (a refused row adds no link); for 6 any earlier row with the
// same student and parent counts, whatever its other errors, since the file holds the pair twice.
async function analyse(rows, db) {
  const parsed = rows.map(({ rowNumber, values }) => ({
    rowNumber,
    studentCode: values.studentCode.toUpperCase(), // typed lower case is accepted (business-rules §3)
    phone: values.phone ? toPhone(values.phone) : '',
    relationshipText: values.relationship,
    relationshipType: RELATIONSHIP_WORDS[headerKey(values.relationship)] ?? null,
  }));

  const codes = [...new Set(parsed.map((r) => r.studentCode).filter(Boolean))];
  const phones = [...new Set(parsed.map((r) => r.phone).filter((p) => PHONE_RE.test(p)))];
  const { rows: students } = await db.query(
    `SELECT s.student_id AS "studentId", s.student_code AS "studentCode", u.full_name AS "fullName"
     FROM students s JOIN users u ON u.user_id = s.user_id
     WHERE s.student_code = ANY($1::text[])`,
    [codes],
  );
  // Only an account that really has the PARENT role, as UC-13 checks (a teacher's phone is not a parent).
  // A LOCKED parent account can be linked (business-rules §4 "Students").
  const { rows: parents } = await db.query(
    `SELECT p.parent_id AS "parentId", p.user_id AS "userId", u.phone, u.full_name AS "fullName"
     FROM users u JOIN parents p ON p.user_id = u.user_id
     WHERE u.phone = ANY($1::text[])
       AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
                   WHERE ur.user_id = u.user_id AND r.role_code = 'PARENT')`,
    [phones],
  );
  const studentByCode = new Map(students.map((s) => [s.studentCode, s]));
  const parentByPhone = new Map(parents.map((p) => [p.phone, p]));
  const { rows: links } = await db.query(
    'SELECT student_id, parent_id FROM student_parents WHERE student_id = ANY($1::bigint[])',
    [students.map((s) => s.studentId)],
  );
  const existingPairs = new Set(links.map((l) => `${l.student_id}:${l.parent_id}`));
  const parentCount = new Map(); // studentId -> existing links + earlier valid rows
  for (const l of links) parentCount.set(l.student_id, (parentCount.get(l.student_id) ?? 0) + 1);
  const pairRow = new Map(); // "studentId:parentId" -> first row number with that pair

  return parsed.map((r) => {
    const student = studentByCode.get(r.studentCode);
    const parent = parentByPhone.get(r.phone);
    const result = {
      rowNumber: r.rowNumber,
      studentCode: r.studentCode,
      phone: r.phone,
      relationshipType: r.relationshipType,
      relationshipText: r.relationshipText,
      status: 'VALID',
      studentName: student?.fullName ?? null,
      parentName: parent?.fullName ?? null,
      errorCode: null,
      errorMessage: null,
      details: null,
    };
    const fail = (error, details = null) => {
      [result.errorCode, result.errorMessage] = ROW_ERRORS[error];
      result.status = 'INVALID';
      result.details = details;
      return result;
    };

    if (!r.studentCode || !r.phone || !r.relationshipText) {
      return fail('REQUIRED', {
        fields: [['studentCode', r.studentCode], ['phone', r.phone], ['relationship', r.relationshipText]]
          .filter(([, value]) => !value).map(([field]) => field),
      });
    }
    if (!student) return fail('STUDENT_NOT_FOUND');
    if (!parent) return fail('PARENT_NOT_FOUND');
    if (!r.relationshipType) return fail('RELATIONSHIP');

    const pair = `${student.studentId}:${parent.parentId}`;
    if (existingPairs.has(pair)) return fail('LINK_EXISTS');
    if (pairRow.has(pair)) return fail('DUPLICATE_IN_FILE', { duplicateOf: pairRow.get(pair) });
    pairRow.set(pair, r.rowNumber);
    const count = parentCount.get(student.studentId) ?? 0;
    if (count >= MAX_PARENTS_PER_STUDENT) return fail('MAX_PARENTS', { max: MAX_PARENTS_PER_STUDENT });
    parentCount.set(student.studentId, count + 1);

    // Kept out of the response (see view): what the import writes.
    Object.defineProperty(result, 'link', {
      value: { studentId: student.studentId, parentId: parent.parentId, parentUserId: parent.userId,
        relationshipType: r.relationshipType },
    });
    return result;
  });
}

function summarise(checked, imported) {
  const valid = checked.filter((r) => r.status !== 'INVALID').length;
  return { total: checked.length, valid, invalid: checked.length - valid, imported };
}

// ---------------------------------------------------------------- preview and import

// Preview: checks the file and lists every row; nothing is written.
export async function previewImport({ file }) {
  if (!file) throw badRequest('MSG_REQUIRED', 'Please choose a file.');
  const rows = await readRows(file);
  const checked = await analyse(rows, pool);
  return { summary: summarise(checked, 0), rows: checked, warnings: [] };
}

// Import: reads and checks the same file again from the start, then saves every valid row in ONE transaction
// (saveParentLinks, the same link path as UC-13). The students of the file are locked first (FOR UPDATE, in
// student_id order, as UC-13 and UC-10 / UC-11 lock them), so the checks and the INSERT see the same links even if
// another School Manager links a parent at the same time. No valid row → MSG_IMPORT_NO_VALID_ROWS and nothing is
// written; any error while saving rolls everything back.
export async function importLinks({ file }) {
  if (!file) throw badRequest('MSG_REQUIRED', 'Please choose a file.');
  const rows = await readRows(file);
  return withTransaction(async (client) => {
    const codes = [...new Set(rows.map((r) => r.values.studentCode.toUpperCase()).filter(Boolean))];
    await client.query(
      'SELECT student_id FROM students WHERE student_code = ANY($1::text[]) ORDER BY student_id FOR UPDATE',
      [codes],
    );
    const checked = await analyse(rows, client);
    const valid = checked.filter((r) => r.status === 'VALID');
    if (!valid.length) throw badRequest('MSG_IMPORT_NO_VALID_ROWS', 'The file has no valid rows to import.');

    const warnings = await saveParentLinks(client, valid.map((r) => r.link));
    for (const r of valid) r.status = 'IMPORTED';
    return { summary: summarise(checked, valid.length), rows: checked, warnings };
  });
}
