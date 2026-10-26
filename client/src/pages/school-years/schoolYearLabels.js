// Labels shared by the SCR-18 pieces. The server sends the derived status of a year (MOM-05: found by date).
export const YEAR_STATUS = {
  UPCOMING: { label: 'Sắp tới', pill: 'blue' },
  CURRENT: { label: 'Hiện tại', pill: 'green' },
  ENDED: { label: 'Đã kết thúc', pill: '' },
};

// A semester's label combines the stored status (OPEN / CLOSED = attendance lock) with its date phase.
export function semesterStatus({ status, phase }) {
  if (status === 'CLOSED') return { label: 'Đã đóng', pill: '' };
  if (phase === 'UPCOMING') return { label: 'Chưa bắt đầu', pill: 'blue' };
  if (phase === 'ONGOING') return { label: 'Đang diễn ra', pill: 'green' };
  return { label: 'Đã kết thúc, chưa đóng', pill: 'amber' };
}

// Stored as "2026-2027" (seed), shown as "2026–2027".
export const yearLabel = (name) => String(name ?? '').replace('-', '–');
