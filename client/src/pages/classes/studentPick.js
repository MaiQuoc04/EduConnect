// Shared helpers of the UC-28 student pickers (create a class, add students to a class).

// Agreed 29/10: at most 45 studying students per class (the server checks it too).
export const MAX_CLASS_SIZE = 45;

export const GENDER_LABELS = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

// Student codes start with HS and the last two digits of the year the student entered the school (agreed 29/10):
// HS26xxxx = khóa 2026. Other codes have no cohort.
export function cohortOf(code) {
  const m = /^HS(\d{2})\d/i.exec(code ?? '');
  return m ? 2000 + Number(m[1]) : null;
}

export const formatDob = (date) => (date ? date.slice(0, 10).split('-').reverse().join('/') : '');

// A student fits a grade when their last class was one grade below (promotion), the same grade (repeating a year)
// or when they never had a class (new to the school).
export function fitsGrade(student, grade) {
  if (!student.previousGrade || !grade) return true;
  const diff = Number(grade) - Number(student.previousGrade);
  return diff === 0 || diff === 1;
}

const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase();

// Problems to show before saving. None of them blocks the save except going over the class size.
export function reviewWarnings(students, grade) {
  const byName = new Map();
  students.forEach((s) => byName.set(fold(s.fullName), [...(byName.get(fold(s.fullName)) ?? []), s]));
  return {
    locked: students.filter((s) => s.status === 'LOCKED'),
    noParent: students.filter((s) => s.parentCount === 0),
    otherGrade: students.filter((s) => !fitsGrade(s, grade)),
    sameName: [...byName.values()].filter((list) => list.length > 1),
  };
}
