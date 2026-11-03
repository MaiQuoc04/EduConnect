import ExcelJS from 'exceljs';
import { badRequest } from './AppError.js';

// Shared helpers for Excel imports (class list UC-27; later timetable, grades, accounts). Only .xlsx is read.

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

// Sends a workbook as a download.
export async function sendWorkbook(res, workbook, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.end(Buffer.from(await workbook.xlsx.writeBuffer()));
}
