// FE-11 display helpers. Scores and averages use a decimal comma (Vietnamese), averages come rounded from the server.

export function fmtScore(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(Number(value)).replace('.', ',');
}

// "8,5" / "8.5" -> "8.5" for the API; '' stays '' (= clear).
export const toApiScore = (text) => String(text ?? '').trim().replace(',', '.');

// Same rule as the server (grades.calc.js parseScore): 0–10, at most 2 decimals; '' is allowed (empty).
export function validScore(text) {
  const t = toApiScore(text);
  if (t === '') return true;
  return /^\d{1,2}(\.\d{1,2})?$/.test(t) && Number(t) <= 10;
}

// Same rounding as the server (grades.calc.js roundScore, Circular 22): 1 decimal, half up, without binary noise.
export function roundScore(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number((value * 10).toPrecision(12))) / 10;
}

// Subject year average from the two (already rounded) semester averages: (HK1 + 2 × HK2) / 3, rounded.
export const yearAverage = (s1, s2) => (s1 === null || s1 === undefined || s2 === null || s2 === undefined ? null : roundScore((s1 + 2 * s2) / 3));

export const semesterLabel = (s) => (s ? `Học kỳ ${s.semesterNo}` : '');

export const BOOK_STATUS = {
  OPEN: { label: 'Chưa chốt', tone: '' },
  LOCKED: { label: 'Đã chốt', tone: 'green' },
  UNLOCKED: { label: 'Đã mở khoá', tone: 'amber' },
};

// Academic result level of a period (Circular 22, Article 9; server grades.calc.js academicLevel), 23/11/2026.
export const LEVELS = {
  GOOD: { label: 'Tốt', tone: 'green' },
  FAIR: { label: 'Khá', tone: 'ink' },
  PASS: { label: 'Đạt', tone: 'amber' },
  FAIL: { label: 'Chưa đạt', tone: 'red' },
};

// Full name of one score slot: "Thường xuyên 1".."Thường xuyên 4" when the component has several scores, else its name.
export const slotLabel = (component, attemptNo) =>
  component.scoreCount > 1 ? `${component.name} ${attemptNo}` : component.name;

// The server sends times already in Vietnam time ("2026-11-10 10:32:34.796202+07"): read the parts as they are.
export function formatDateTime(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(value));
  return m ? `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}` : String(value);
}

// Subjects assessed by comments (môn đánh giá bằng nhận xét, Circular 22/2021; 27/11/2026): each assessment and the
// semester / year result is Đạt (PASS) or Chưa đạt (FAIL), written in full everywhere (no Đ / CĐ short forms).
export const RESULT_LONG = { PASS: 'Đạt', FAIL: 'Chưa đạt' };
export const fmtResult = (value) => RESULT_SHORT[value] ?? '';
// "Đ" / "CĐ" typed in the grid -> PASS / FAIL for the API; '' stays '' (= clear).
export const toApiResult = (text) => ({ Đ: 'PASS', CĐ: 'FAIL' })[String(text ?? '').trim()] ?? '';
export const validResult = (text) => ['', 'Đ', 'CĐ'].includes(String(text ?? '').trim());
export const isCommentBook = (book) => book?.assessmentType === 'COMMENT';
