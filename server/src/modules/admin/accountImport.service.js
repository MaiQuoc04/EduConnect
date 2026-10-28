import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../../config/db.js';
import { AppError, badRequest } from '../../utils/AppError.js';
import { logActivity } from '../../utils/activityLog.js';
import { removeAccents, planUsernames } from '../../utils/username.js';
import { prepareCredentials, readAccountInput } from './accounts.service.js';

// UC-93 Import Accounts (FE-13, owner: Linh): System Admin uploads one .xlsx / .csv file per account type, checks a
// preview, then creates every valid row in one transaction. The temporary passwords are returned once.
// ASSUMPTION: one template per account type (Student, Teacher, Parent, School Manager), not one file with a Role
// column; System Admin accounts are created one by one (UC-92).
// ASSUMPTION: at most 500 rows per file (hashing each temporary password takes ~0.1 s).

export const IMPORT_TYPES = ['STUDENT', 'TEACHER', 'PARENT', 'SCHOOL_MANAGER'];
const MAX_ROWS = 500;

// Columns of each template, in order. `key` = field name used by readAccountInput (UC-92 rules).
const COL = {
  fullName: { key: 'fullName', header: 'Họ và tên', width: 28 },
  studentCode: { key: 'studentCode', header: 'Mã học sinh', width: 16, text: true },
  dob: { key: 'dob', header: 'Ngày sinh (dd/mm/yyyy)', width: 22, text: true },
  gender: { key: 'gender', header: 'Giới tính (Nam/Nữ/Khác)', width: 22 },
  teacherCode: { key: 'teacherCode', header: 'Mã giáo viên', width: 16, text: true },
  department: { key: 'department', header: 'Tổ chuyên môn', width: 22 },
  email: { key: 'email', header: 'Email', width: 30 },
  phone: { key: 'phone', header: 'Số điện thoại', width: 16, text: true },
  occupation: { key: 'occupation', header: 'Nghề nghiệp', width: 20 },
  address: { key: 'address', header: 'Địa chỉ', width: 40 },
};
const TEMPLATES = {
  STUDENT: { name: 'hoc-sinh', label: 'Học sinh', columns: ['fullName', 'studentCode', 'dob', 'gender', 'email', 'phone', 'address'], required: ['fullName', 'studentCode'] },
  TEACHER: { name: 'giao-vien', label: 'Giáo viên', columns: ['fullName', 'teacherCode', 'department', 'email', 'phone', 'address'], required: ['fullName', 'teacherCode'] },
  PARENT: { name: 'phu-huynh', label: 'Phụ huynh', columns: ['fullName', 'phone', 'email', 'occupation', 'address'], required: ['fullName', 'phone'] },
  SCHOOL_MANAGER: { name: 'quan-ly', label: 'Quản lý nhà trường', columns: ['fullName', 'email', 'phone', 'address'], required: ['fullName'] },
};
const CODE_FIELD = { STUDENT: 'studentCode', TEACHER: 'teacherCode' };
const GENDER_WORDS = { nam: 'MALE', male: 'MALE', nu: 'FEMALE', female: 'FEMALE', khac: 'OTHER', other: 'OTHER' };
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// "Ngày sinh (dd/mm/yyyy) *" -> "ngaysinh": headers are matched without accents, case, notes or "*".
const headerKey = (value) =>
  removeAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');

function readType(type) {
  if (!IMPORT_TYPES.includes(type)) throw badRequest('MSG_IMPORT_TYPE', 'Please choose the account type of the file.');
  return TEMPLATES[type];
}

// ---------------------------------------------------------------- template (UC-93 step 2)

export async function buildTemplate(type) {
  const template = readType(type);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tai khoan');
  ws.columns = template.columns.map((c) => ({
    header: `${COL[c].header}${template.required.includes(c) ? ' *' : ''}`,
    key: c,
    width: COL[c].width,
    style: COL[c].text ? { numFmt: '@' } : {}, // keeps leading zeros of phone numbers and codes
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F1FA' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const help = wb.addWorksheet('Huong dan');
  help.columns = [{ width: 110 }];
  [
    `Mẫu nhập tài khoản ${template.label} – EduConnect`,
    'Mỗi dòng của trang "Tai khoan" là một tài khoản. Không đổi tên hay thứ tự các cột ở dòng 1.',
    'Cột có dấu * là bắt buộc. Email và số điện thoại không được trùng với tài khoản khác hoặc dòng khác trong file.',
    'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0. Phụ huynh bắt buộc có số điện thoại.',
    'Ngày sinh ghi theo dạng dd/mm/yyyy, ví dụ 05/09/2010. Giới tính ghi Nam, Nữ hoặc Khác.',
    'Tên đăng nhập và mật khẩu tạm thời do hệ thống tạo; tải file kết quả ngay sau khi nhập vì mật khẩu chỉ hiển thị một lần.',
    `Tối đa ${MAX_ROWS} dòng mỗi file.`,
  ].forEach((line, i) => {
    help.addRow([line]).font = i === 0 ? { bold: true, size: 13 } : {};
  });

  return {
    fileName: `mau-nhap-tai-khoan-${template.name}.xlsx`,
    contentType: XLSX_MIME,
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}

// ---------------------------------------------------------------- reading the file

// Plain text of an ExcelJS cell value (rich text, hyperlinks and formulas included).
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return cellText(value.text);
    if ('result' in value) return cellText(value.result);
    return '';
  }
  return String(value).trim();
}

async function loadWorksheet(file) {
  const wb = new ExcelJS.Workbook();
  const isZip = file.buffer.length > 4 && file.buffer.readUInt32LE(0) === 0x04034b50; // .xlsx is a zip file
  const isCsv = /\.csv$/i.test(file.originalname ?? '');
  try {
    if (isZip) {
      await wb.xlsx.load(file.buffer);
      return wb.worksheets[0];
    }
    if (isCsv) {
      const content = file.buffer.toString('utf8').replace(/^﻿/, '');
      // map keeps every value as typed (no automatic number / date conversion).
      return await wb.csv.read(Readable.from([content]), { map: (v) => v });
    }
  } catch {
    // fall through: unreadable file
  }
  throw badRequest('MSG_IMPORT_FILE', 'Only .xlsx or .csv files made from the template can be imported.');
}

function toIsoDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'invalid';
    return value.toISOString().slice(0, 10); // Excel dates are stored at midnight UTC
  }
  const s = String(value).trim();
  // A date typed into a text-formatted cell can arrive as Excel's day number (40212 = 03/02/2010).
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 0 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return 'invalid';
}

const isRealDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso && d <= new Date();
};

function toPhone(value) {
  let s = value instanceof Date ? '' : String(value ?? '').trim();
  if (/^\d{9}$/.test(s)) s = `0${s}`; // Excel dropped the leading 0 of a number cell
  return s;
}

// Reads the rows of the sheet into { row, values } using the header row to find each column.
async function readRows(file, template) {
  const ws = await loadWorksheet(file);
  if (!ws) throw badRequest('MSG_IMPORT_FILE', 'Only .xlsx or .csv files made from the template can be imported.');

  const columnOf = {};
  ws.getRow(1).eachCell((cell, col) => {
    const key = headerKey(cellText(cell.value));
    const field = template.columns.find((c) => headerKey(COL[c].header) === key);
    if (field && !columnOf[field]) columnOf[field] = col;
  });
  const missing = template.required.filter((c) => !columnOf[c]).map((c) => COL[c].header);
  if (missing.length) {
    throw badRequest('MSG_IMPORT_TEMPLATE', 'The file does not follow the template: required columns are missing.', {
      missing,
    });
  }

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const values = {};
    for (const [field, col] of Object.entries(columnOf)) values[field] = cellText(row.getCell(col).value);
    if (Object.values(values).every((v) => v === '')) continue; // empty line
    rows.push({ row: r, values });
  }
  if (!rows.length) throw badRequest('MSG_IMPORT_EMPTY', 'The file has no data rows.');
  if (rows.length > MAX_ROWS) {
    throw badRequest('MSG_IMPORT_TOO_MANY_ROWS', `A file can hold at most ${MAX_ROWS} rows.`, { max: MAX_ROWS });
  }
  return rows;
}

// ---------------------------------------------------------------- checking the rows (UC-93 steps 4–7)

async function analyse(file, type) {
  const template = readType(type);
  const rows = await readRows(file, template);

  const checked = rows.map(({ row, values }) => {
    const dob = toIsoDate(values.dob);
    const genderWord = headerKey(values.gender);
    const body = {
      fullName: values.fullName,
      roles: [type],
      email: values.email instanceof Date ? '' : values.email,
      phone: toPhone(values.phone),
      student: { studentCode: values.studentCode, dob: dob === 'invalid' ? '' : dob, gender: GENDER_WORDS[genderWord] ?? '' },
      teacher: { teacherCode: values.teacherCode, department: values.department },
      address: values.address,
      parent: { occupation: values.occupation },
    };
    const { input, errors } = readAccountInput(body); // same rules as UC-92
    if (dob === 'invalid' || (dob && !isRealDate(dob))) errors.dob = 'INVALID';
    if (values.gender && !GENDER_WORDS[genderWord]) errors.gender = 'INVALID';
    return { row, input, errors, duplicateOf: {} };
  });

  // Same email / phone / code twice in the file: the later rows are invalid.
  const firstRow = {};
  for (const r of checked) {
    const code = r.input.student?.studentCode || r.input.teacher?.teacherCode;
    const keys = { email: r.input.email, phone: r.input.phone, [CODE_FIELD[type] ?? 'code']: code };
    for (const [field, value] of Object.entries(keys)) {
      if (!value || r.errors[field]) continue;
      const k = `${field}:${value.toLowerCase()}`;
      if (firstRow[k]) {
        r.errors[field] = 'DUPLICATE_IN_FILE';
        r.duplicateOf[field] = firstRow[k];
      } else firstRow[k] = r.row;
    }
  }

  // Already used by an account in the database (BR-01).
  const list = (pick) => [...new Set(checked.map(pick).filter(Boolean))];
  const emails = list((r) => r.input.email);
  const phones = list((r) => r.input.phone);
  const codes = list((r) => r.input.student?.studentCode || r.input.teacher?.teacherCode);
  const codeSql = {
    STUDENT: 'SELECT student_code AS v FROM students WHERE student_code = ANY($1::text[])',
    TEACHER: 'SELECT teacher_code AS v FROM teachers WHERE teacher_code = ANY($1::text[])',
  }[type];
  const [usedEmails, usedPhones, usedCodes] = await Promise.all([
    pool.query('SELECT LOWER(email) AS v FROM users WHERE LOWER(email) = ANY($1::text[])', [emails]),
    pool.query('SELECT phone AS v FROM users WHERE phone = ANY($1::text[])', [phones]),
    codeSql ? pool.query(codeSql, [codes]) : { rows: [] },
  ]);
  const used = {
    email: new Set(usedEmails.rows.map((r) => r.v)),
    phone: new Set(usedPhones.rows.map((r) => r.v)),
    code: new Set(usedCodes.rows.map((r) => r.v)),
  };
  for (const r of checked) {
    if (r.input.email && !r.errors.email && used.email.has(r.input.email)) r.errors.email = 'DUPLICATE';
    if (r.input.phone && !r.errors.phone && used.phone.has(r.input.phone)) r.errors.phone = 'DUPLICATE';
    const codeField = CODE_FIELD[type];
    const code = r.input.student?.studentCode || r.input.teacher?.teacherCode;
    if (codeField && code && !r.errors[codeField] && used.code.has(code)) r.errors[codeField] = 'DUPLICATE';
  }

  const valid = checked.filter((r) => !Object.keys(r.errors).length);
  const usernames = await planUsernames(pool, valid.map((r) => r.input.fullName));
  valid.forEach((r, i) => {
    r.username = usernames[i];
  });
  return { template, checked, valid };
}

const rowView = (r) => ({
  row: r.row,
  fullName: r.input.fullName,
  code: r.input.student?.studentCode || r.input.teacher?.teacherCode || null,
  dob: r.input.student?.dob ?? null,
  gender: r.input.student?.gender ?? null,
  department: r.input.teacher?.department ?? null,
  email: r.input.email,
  phone: r.input.phone,
  occupation: r.input.parent?.occupation ?? null,
  address: r.input.address,
  username: r.username ?? null,
  errors: r.errors,
  duplicateOf: r.duplicateOf,
});

// UC-93 steps 3–7: check the file and show what would be created. Nothing is saved.
export async function previewImport({ file, type }) {
  if (!file) throw badRequest('MSG_REQUIRED', 'Please choose a file.');
  const { checked, valid } = await analyse(file, type);
  return {
    type,
    fileName: file.originalname,
    total: checked.length,
    validCount: valid.length,
    invalidCount: checked.length - valid.length,
    rows: checked.map(rowView),
  };
}

// ---------------------------------------------------------------- import (UC-93 steps 8–11)

async function buildCredentialsFile(type, created) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tai khoan');
  const codeHeader = type === 'STUDENT' ? 'Mã học sinh' : type === 'TEACHER' ? 'Mã giáo viên' : null;
  ws.columns = [
    { header: 'STT', key: 'no', width: 6 },
    { header: 'Họ và tên', key: 'fullName', width: 28 },
    ...(codeHeader ? [{ header: codeHeader, key: 'code', width: 16 }] : []),
    { header: 'Tên đăng nhập', key: 'username', width: 18 },
    { header: 'Mật khẩu tạm thời', key: 'temporaryPassword', width: 20 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Số điện thoại', key: 'phone', width: 16, style: { numFmt: '@' } },
  ];
  ws.getRow(1).font = { bold: true };
  created.forEach((c, i) => ws.addRow({ no: i + 1, ...c }));
  ws.addRow([]);
  ws.addRow(['', 'Mật khẩu tạm thời chỉ dùng cho lần đăng nhập đầu tiên; người dùng phải đổi mật khẩu ngay sau đó.']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function importAccounts({ file, type, actorId, ip }) {
  if (!file) throw badRequest('MSG_REQUIRED', 'Please choose a file.');
  const { template, checked, valid } = await analyse(file, type); // checked again: the data may have changed
  if (!valid.length) throw badRequest('MSG_IMPORT_NO_VALID_ROWS', 'The file has no valid rows to import.');

  // Hash the temporary passwords before opening the transaction (the slow part).
  const credentials = [];
  for (const r of valid) credentials.push(await prepareCredentials(null, r.input, r.username));

  try {
    await withTransaction(async (client) => {
      const { rows: users } = await client.query(
        `INSERT INTO users (username, email, phone, password_hash, full_name, address, status, must_change_password)
         SELECT u.username, u.email, u.phone, u.hash, u.full_name, u.address, 'ACTIVE', TRUE
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
              AS u(username, email, phone, hash, full_name, address)
         RETURNING user_id, username`,
        [
          credentials.map((c) => c.username),
          valid.map((r) => r.input.email),
          valid.map((r) => r.input.phone),
          credentials.map((c) => c.passwordHash),
          valid.map((r) => r.input.fullName),
          valid.map((r) => r.input.address),
        ],
      );
      const idOf = new Map(users.map((u) => [u.username, u.user_id]));
      const ids = credentials.map((c) => idOf.get(c.username));
      valid.forEach((r, i) => {
        r.userId = ids[i];
      });

      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT u, (SELECT role_id FROM roles WHERE role_code = $2) FROM unnest($1::bigint[]) AS u`,
        [ids, type],
      );
      if (type === 'STUDENT') {
        await client.query(
          `INSERT INTO students (user_id, student_code, dob, gender)
           SELECT * FROM unnest($1::bigint[], $2::text[], $3::date[], $4::text[])`,
          [ids, valid.map((r) => r.input.student.studentCode), valid.map((r) => r.input.student.dob), valid.map((r) => r.input.student.gender)],
        );
      } else if (type === 'TEACHER') {
        await client.query(
          `INSERT INTO teachers (user_id, teacher_code, department)
           SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[])`,
          [ids, valid.map((r) => r.input.teacher.teacherCode), valid.map((r) => r.input.teacher.department)],
        );
      } else if (type === 'PARENT') {
        await client.query(
          `INSERT INTO parents (user_id, occupation) SELECT * FROM unnest($1::bigint[], $2::text[])`,
          [ids, valid.map((r) => r.input.parent.occupation)],
        );
      }
    });
  } catch (err) {
    // Another admin used one of the usernames, emails, phones or codes after the check: nothing was saved.
    if (err.code === '23505') {
      throw new AppError(409, 'MSG_IMPORT_CONFLICT', 'Some data changed while importing. Nothing was saved; please check the file again.');
    }
    throw err;
  }

  const created = valid.map((r, i) => ({
    row: r.row,
    userId: r.userId,
    fullName: r.input.fullName,
    code: r.input.student?.studentCode || r.input.teacher?.teacherCode || null,
    username: credentials[i].username,
    temporaryPassword: credentials[i].temporaryPassword,
    email: r.input.email,
    phone: r.input.phone,
  }));

  await logActivity({
    userId: actorId,
    action: 'ACCOUNT_IMPORT',
    targetType: 'USER',
    detail: { type, fileName: file.originalname, created: created.length, skipped: checked.length - valid.length },
    ip,
  });

  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).replaceAll('-', '');
  return {
    type,
    createdCount: created.length,
    skippedCount: checked.length - valid.length,
    accounts: created.map(({ userId, ...c }) => ({ id: userId, ...c })),
    file: {
      name: `tai-khoan-${template.name}-${date}.xlsx`,
      contentType: XLSX_MIME,
      base64: (await buildCredentialsFile(type, created)).toString('base64'),
    },
  };
}
