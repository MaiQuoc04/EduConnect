import { formatDate } from '../../utils/format.js';

// Labels of a class enrollment (FE-02), shared by SCR-08 "Quá trình học", the transfer page's history and the
// promotion roster (27/11/2026, business-rules §4, display only).
export const ENROLLMENT_LABELS = { STUDYING: 'Đang học', TRANSFERRED: 'Đã chuyển lớp', DROPPED: 'Đã nghỉ học' };

// A STUDYING enrollment follows its school year (yearState from the API, computed on the DB's Vietnam date): not
// started yet → "Đã xếp lớp", ended → "Đã hoàn thành", current → "Đang học" (the only green one). UC-11 leaves the old
// year's row STUDYING (promotion = new enrollment), so without this a promoted student showed "Đang học" in two years.
const YEAR_STATE_LABELS = { UPCOMING: 'Đã xếp lớp', ENDED: 'Đã hoàn thành' };

/** { label, green } of an enrollment status in its year. */
export function enrollmentLabel(status, yearState) {
  if (status !== 'STUDYING') return { label: ENROLLMENT_LABELS[status] ?? status, green: false };
  const label = YEAR_STATE_LABELS[yearState];
  return label ? { label, green: false } : { label: ENROLLMENT_LABELS.STUDYING, green: true };
}

/**
 * What one history row shows: { label, green, time, note? }. Needs enrolledAt, leftAt, status, yearState,
 * schoolYearStart, schoolYearEnd (UC-08 enrollmentHistory). TRANSFERRED / DROPPED rows are as before.
 *   not started yet: "Bắt đầu <first day of the year>" + note "Xếp lớp ngày <enrolled_at>";
 *   ended:           "<enrolled_at> – <last day of the year>";
 *   current:         "<enrolled_at> – nay" for the current enrollment only.
 */
export function enrollmentView(e, isCurrent) {
  const { label, green } = enrollmentLabel(e.status, e.yearState);
  if (e.status !== 'STUDYING') {
    return { label, green, time: e.leftAt ? `${formatDate(e.enrolledAt)} – ${formatDate(e.leftAt)}` : formatDate(e.enrolledAt) };
  }
  if (e.yearState === 'UPCOMING') {
    return { label, green, time: `Bắt đầu ${formatDate(e.schoolYearStart)}`, note: `Xếp lớp ngày ${formatDate(e.enrolledAt)}` };
  }
  if (e.yearState === 'ENDED') {
    return { label, green, time: `${formatDate(e.enrolledAt)} – ${formatDate(e.schoolYearEnd)}` };
  }
  // ASSUMPTION: a second STUDYING row of the current year (not the current enrollment) shows its start date alone.
  return { label, green, time: isCurrent ? `${formatDate(e.enrolledAt)} – nay` : formatDate(e.enrolledAt) };
}
