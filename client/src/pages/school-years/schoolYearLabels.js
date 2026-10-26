// Labels shared by the SCR-18 pieces. The server sends the derived status of a year (MOM-05: found by date).
export const YEAR_STATUS = {
  UPCOMING: { label: 'Sắp tới', pill: 'blue' },
  CURRENT: { label: 'Hiện tại', pill: 'green' },
  ENDED: { label: 'Đã kết thúc', pill: '' },
};

export const SEMESTER_STATUS = {
  OPEN: { label: 'Đang mở', pill: 'green' },
  CLOSED: { label: 'Đã đóng', pill: '' },
};

// Stored as "2026-2027" (seed), shown as "2026–2027".
export const yearLabel = (name) => String(name ?? '').replace('-', '–');
