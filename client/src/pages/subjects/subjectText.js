// Text helpers shared by the subject screens (SCR-19, SCR-20, SCR-21).

// Lower case without Vietnamese accents, so "hoa" finds "Hoá học" and "dia" finds "Địa lí".
export const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export function periodsText({ periodsMin, periodsMax }) {
  if (periodsMin === null || periodsMin === undefined) return '—';
  return periodsMin === periodsMax ? `${periodsMin} tiết` : `${periodsMin}–${periodsMax} tiết`;
}

// NUMERIC comes as a string: "2.00" -> "2", "1.50" -> "1,5".
export const formatWeight = (value) => String(Number(value)).replace('.', ',');
