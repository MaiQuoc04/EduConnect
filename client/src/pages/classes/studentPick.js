// Shared helpers of the UC-28 student pickers (create a class, add students to a class).

// Agreed 29/10: at most 45 studying students per class (the server checks it too).
export const MAX_CLASS_SIZE = 45;

export const GENDER_LABELS = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

export const formatDob = (date) => (date ? date.slice(0, 10).split('-').reverse().join('/') : '');

const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase();

// Problems to show before saving. None of them blocks the save except going over the class size.
export function reviewWarnings(students) {
  const byName = new Map();
  students.forEach((s) => byName.set(fold(s.fullName), [...(byName.get(fold(s.fullName)) ?? []), s]));
  return {
    locked: students.filter((s) => s.status === 'LOCKED'),
    noParent: students.filter((s) => s.parentCount === 0),
    sameName: [...byName.values()].filter((list) => list.length > 1),
  };
}
