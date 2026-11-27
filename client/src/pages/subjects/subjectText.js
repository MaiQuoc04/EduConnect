// Text helpers shared by the subject screens (SCR-23, SCR-24, SCR-26).

// Lower case without Vietnamese accents, so "hoa" finds "Hoá học" and "dia" finds "Địa lí".
export const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

// What a subject code may contain (UC-24 / UC-25): "toán học" -> "TOAN_HOC".
export const toSubjectCode = (text) =>
  fold(text)
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 20);

// SCR-23 (27/11/2026): the grades of a subject's class types, in number order – "Khối 10–12" when they follow
// each other, "Khối 10, 12" otherwise. Types without a grade (deleted old rows only) are left out of the grades.
export function gradesOf(tracks) {
  return [...new Set(tracks.map((t) => t.gradeLevel).filter(Boolean))].sort(
    (a, b) => Number(a) - Number(b) || String(a).localeCompare(String(b), 'vi'),
  );
}

export function scopeText(tracks) {
  if (!tracks?.length) return '';
  const grades = gradesOf(tracks);
  const numbers = grades.map(Number);
  const followOn =
    grades.length > 1 && numbers.every((n, i) => Number.isInteger(n) && (i === 0 || n === numbers[i - 1] + 1));
  const gradeText = !grades.length
    ? ''
    : followOn
      ? ` (Khối ${grades[0]}–${grades[grades.length - 1]})`
      : ` (Khối ${grades.join(', ')})`;
  return `${tracks.length} loại lớp${gradeText}`;
}

export function periodsText({ periodsMin, periodsMax }) {
  if (periodsMin === null || periodsMin === undefined) return '—';
  return periodsMin === periodsMax ? `${periodsMin} tiết` : `${periodsMin}–${periodsMax} tiết`;
}
