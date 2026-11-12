import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { badRequest } from './AppError.js';
import { removeAccents } from './username.js';

// Shared helpers for Excel imports and exports. Two ways to read an upload:
// - readSheet: .xlsx only, every column required (class list UC-27, grades UC-84).
// - loadTemplateSheet + templateHeaderKey: .xlsx or .csv made from a downloaded template, headers matched without
//   notes in brackets or "*" (accounts UC-96, FE-13; parent–student links UC-14 can use them too).

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// A cell as trimmed text: numbers stay as typed ("10"), rich text and formulas use their shown value.
export function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('').trim();
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return cellText(value.text);
    return '';
  }
  return String(value).trim();
}

// Header text compared without case, accents or extra spaces: "Mã học sinh" = "ma hoc sinh".
export const headerKey = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// Reads the first sheet. `columns` = { key: 'Header text', … }; the header row is the first non-empty row.
// Returns [{ row: excelRowNumber, values: { key: text } }], skipping blank rows.
// Throws MSG_IMPORT_FILE_TYPE (not a readable .xlsx), MSG_IMPORT_HEADER (a column is missing),
// MSG_IMPORT_EMPTY (no data row) and MSG_IMPORT_TOO_MANY_ROWS.
export async function readSheet(buffer, columns, { maxRows = 2000 } = {}) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw badRequest('MSG_IMPORT_FILE_TYPE', 'Please choose an Excel file (.xlsx).');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw badRequest('MSG_IMPORT_EMPTY', 'The file has no data rows.');

  let headerRow = null;
  sheet.eachRow((row) => {
    if (!headerRow && row.values.some((v) => cellText(v))) headerRow = row;
  });
  if (!headerRow) throw badRequest('MSG_IMPORT_EMPTY', 'The file has no data rows.');

  const positions = {};
  headerRow.eachCell((cell, col) => {
    const key = Object.keys(columns).find((k) => headerKey(columns[k]) === headerKey(cellText(cell.value)));
    if (key && !positions[key]) positions[key] = col;
  });
  const missing = Object.keys(columns).filter((k) => !positions[k]);
  if (missing.length) {
    throw badRequest('MSG_IMPORT_HEADER', 'Some columns are missing from the header row.', {
      missing: missing.map((k) => columns[k]),
    });
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow.number) return;
    const values = {};
    for (const [key, col] of Object.entries(positions)) values[key] = cellText(row.getCell(col).value);
    if (Object.values(values).some(Boolean)) rows.push({ row: rowNumber, values });
  });
  if (!rows.length) throw badRequest('MSG_IMPORT_EMPTY', 'The file has no data rows.');
  if (rows.length > maxRows) {
    throw badRequest('MSG_IMPORT_TOO_MANY_ROWS', `The file has more than ${maxRows} rows.`, { maxRows });
  }
  return rows;
}

// Accepts only an .xlsx upload (req.file from uploadSingle).
export function assertXlsx(file) {
  if (!file) throw badRequest('MSG_REQUIRED', 'Please choose a file.');
  if (!/\.xlsx$/i.test(file.originalname ?? '')) {
    throw badRequest('MSG_IMPORT_FILE_TYPE', 'Please choose an Excel file (.xlsx).');
  }
}

// .xlsx bytes of a workbook (for a JSON response or a download).
export async function workbookBuffer(workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// A template header compared without accents, case, notes in brackets, "*" or spaces:
// "Ngày sinh (dd/mm/yyyy) *" -> "ngaysinh".
export const templateHeaderKey = (value) =>
  removeAccents(String(value ?? ''))
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]/g, '');

const templateFileError = () =>
  badRequest('MSG_IMPORT_FILE', 'Only .xlsx or .csv files made from the template can be imported.');

// The first sheet of an upload made from a template: a real .xlsx named *.xlsx, or a UTF-8 .csv named *.csv (values
// kept as typed). Anything else, or an unreadable file, throws MSG_IMPORT_FILE.
export async function loadTemplateSheet(file) {
  const name = file?.originalname ?? '';
  const isXlsxName = /\.xlsx$/i.test(name);
  const isCsvName = /\.csv$/i.test(name);
  if (!file?.buffer || (!isXlsxName && !isCsvName)) throw templateFileError();
  const wb = new ExcelJS.Workbook();
  const isZip = file.buffer.length > 4 && file.buffer.readUInt32LE(0) === 0x04034b50; // .xlsx is a zip file
  let sheet;
  try {
    if (isXlsxName && isZip) {
      await wb.xlsx.load(file.buffer);
      [sheet] = wb.worksheets;
    } else if (isCsvName && !isZip) {
      const content = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
      sheet = await wb.csv.read(Readable.from([content]), { map: (v) => v });
    }
  } catch {
    // unreadable: same error below
  }
  if (!sheet) throw templateFileError();
  return sheet;
}

// Sends a workbook as a download.
export async function sendWorkbook(res, workbook, filename) {
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.end(await workbookBuffer(workbook));
}
