import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAttendanceSheet, getLessonHistory, saveAttendanceSheet } from '../../api/attendance.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { ABSENCES, dmy, fmtDateTime, STATUS, STATUS_ORDER, StatusTag, weekday } from './attendanceShared.jsx';

// The sheet of one period – UC-90 Take Attendance / UC-91 Edit Attendance (business rules §12, details 18/11/2026).
// What can be changed comes from the server (`mode`):
//   TEACHER  every status and note of the whole class; a sheet never taken opens with everyone "Có mặt" (point 3)
//   HOMEROOM only excused <-> unexcused of recorded absences, with a reason
//   MANAGER  everything, with a reason (a period never taken: the whole class)
//   VIEW     read only; `blocked` says why
// onSaved(sheet) after a save (the page refreshes its list); onDirty(bool) while there are unsaved changes.

const MODE_TEXT = {
  TEACHER: (deadline) => `Bạn điểm danh và sửa được tiết này đến ${deadline} hôm nay. Lưu một lần cho cả lớp.`,
  HOMEROOM: () => 'Bạn là giáo viên chủ nhiệm: chỉ đổi giữa vắng có phép và vắng không phép, kèm lý do.',
  MANAGER: () => 'Quản lý nhà trường sửa được mọi trạng thái. Mỗi lần sửa cần ghi lý do và được lưu vào lịch sử.',
};
const BLOCKED_TEXT = {
  MSG_ATTENDANCE_NOT_STARTED: 'Tiết học chưa bắt đầu nên chưa điểm danh được.',
  MSG_ATTENDANCE_DEADLINE_PASSED: 'Đã quá hạn điểm danh của tiết này. Cần sửa thì liên hệ quản lý nhà trường.',
  MSG_SEMESTER_CLOSED: 'Học kỳ đã đóng nên không đổi được nữa. Cần sửa thì liên hệ quản lý nhà trường.',
  MSG_SCHOOL_YEAR_ENDED: 'Năm học đã kết thúc nên không đổi được nữa. Cần sửa thì liên hệ quản lý nhà trường.',
  MSG_ATTENDANCE_VIEW_ONLY: 'Bạn chỉ xem được điểm danh của tiết này.',
};

// A sheet never taken starts from the server's prefill (lead 23/11/2026, §12 point 3): the statuses and notes of the
// nearest earlier taken period of the same day and session, copied as they are; without one (first period of the
// session), everyone present. Only a draft – the period is taken when this teacher saves it.
function draftOf(sheet) {
  const fill = !sheet.lesson.taken && (sheet.mode === 'TEACHER' || sheet.mode === 'MANAGER');
  const from = fill ? sheet.prefill?.records ?? {} : {};
  return Object.fromEntries(
    sheet.students.map((s) => {
      if (s.status) return [s.enrollmentId, { status: s.status, note: s.note ?? '' }];
      const p = from[s.enrollmentId];
      if (p) return [s.enrollmentId, { status: p.status, note: p.note ?? '' }];
      return [s.enrollmentId, { status: fill && s.onRoll ? 'PRESENT' : null, note: '' }];
    }),
  );
}

export default function AttendanceSheet({ lessonId, onSaved, onDirty }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, sheet: null, error: '' });
  const [draft, setDraft] = useState({});
  const [initial, setInitial] = useState({}); // the draft as opened: what the user changed is compared with it
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [history, setHistory] = useState(null); // null = closed

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    return getAttendanceSheet(lessonId)
      .then((sheet) => {
        setState({ loading: false, sheet, error: '' });
        setDraft(draftOf(sheet));
        setInitial(draftOf(sheet));
        setReason('');
        setFormError('');
        setHistory(null);
      })
      .catch((err) => setState({ loading: false, sheet: null, error: errorText(err) }));
  }, [lessonId]);
  useEffect(() => {
    load();
  }, [load]);

  const sheet = state.sheet;
  const mode = sheet?.mode ?? 'VIEW';
  const editable = mode !== 'VIEW';

  // Students whose status or note differs from what is stored.
  const changed = useMemo(() => {
    if (!sheet) return [];
    return sheet.students.filter((s) => {
      const d = draft[s.enrollmentId];
      return d && (d.status !== (s.status ?? null) || (d.note ?? '') !== (s.note ?? ''));
    });
  }, [sheet, draft]);
  // A sheet never taken already differs from what is stored (everyone "Có mặt"), so it can be saved at once.
  const dirty = editable && changed.length > 0;
  // Unsaved work of the user (not the "everyone present" start of a new sheet): the page asks before leaving it.
  const touched = Object.keys(draft).some(
    (id) => draft[id]?.status !== initial[id]?.status || (draft[id]?.note ?? '') !== (initial[id]?.note ?? ''),
  );
  useEffect(() => {
    onDirty?.(editable && touched);
  }, [editable, touched, onDirty]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, LATE: 0, ABSENT_EXCUSED: 0, ABSENT_UNEXCUSED: 0, none: 0 };
    for (const s of sheet?.students ?? []) {
      const st = draft[s.enrollmentId]?.status;
      if (st) c[st] += 1;
      else if (s.onRoll) c.none += 1;
    }
    return c;
  }, [sheet, draft]);

  const setStatus = (id, status) => setDraft((d) => ({ ...d, [id]: { ...d[id], status } }));
  const setNote = (id, note) => setDraft((d) => ({ ...d, [id]: { ...d[id], note } }));
  const allPresent = () =>
    setDraft((d) =>
      Object.fromEntries(
        sheet.students.map((s) => [s.enrollmentId, { ...d[s.enrollmentId], status: s.onRoll || d[s.enrollmentId]?.status ? 'PRESENT' : null }]),
      ),
    );

  const canPick = (s, status) => {
    if (mode === 'TEACHER' || mode === 'MANAGER') return true;
    if (mode === 'HOMEROOM') return ABSENCES.includes(s.status) && ABSENCES.includes(status);
    return false;
  };

  async function save() {
    setFormError('');
    if (sheet.reasonRequired && !reason.trim()) {
      setFormError('Vui lòng ghi lý do thay đổi.');
      return;
    }
    let rows;
    if (mode === 'TEACHER' || (mode === 'MANAGER' && !sheet.lesson.taken)) {
      rows = sheet.students.filter((s) => s.onRoll || draft[s.enrollmentId]?.status);
      const missing = rows.filter((s) => !draft[s.enrollmentId]?.status);
      if (missing.length) {
        setFormError(`Còn ${missing.length} học sinh chưa có trạng thái.`);
        return;
      }
    } else {
      rows = changed.filter((s) => draft[s.enrollmentId]?.status);
    }
    if (!rows.length) {
      setFormError('Chưa có thay đổi nào để lưu.');
      return;
    }
    setSaving(true);
    try {
      const records = rows.map((s) => ({ enrollmentId: s.enrollmentId, status: draft[s.enrollmentId].status, note: draft[s.enrollmentId].note }));
      const result = await saveAttendanceSheet(lessonId, records, reason.trim());
      setState({ loading: false, sheet: result, error: '' });
      setDraft(draftOf(result));
      setInitial(draftOf(result));
      setReason('');
      setHistory(null);
      const { changed: n, notified } = result.saved;
      toast(
        n
          ? `Đã lưu điểm danh. ${n} trạng thái được ghi nhận${notified ? `, đã gửi ${notified} thông báo tới học sinh và phụ huynh` : ''}.`
          : 'Đã lưu điểm danh.',
      );
      onSaved?.(result);
    } catch (err) {
      setFormError(errorText(err));
      if (err.status === 403) load(); // the window closed meanwhile: show what is allowed now
    } finally {
      setSaving(false);
    }
  }

  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    try {
      setHistory((await getLessonHistory(lessonId)).items);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    }
  }

  if (state.loading && !sheet) return <section className="card card-outline att-sheet is-loading" aria-busy="true">Đang tải bảng điểm danh…</section>;
  if (state.error) {
    return (
      <section className="card card-outline att-sheet">
        <p className="form-error" role="alert">{state.error}</p>
        <button type="button" className="btn btn-secondary" onClick={load}>Thử lại</button>
      </section>
    );
  }
  const { lesson } = sheet;

  return (
    <section className="card card-outline att-sheet" aria-labelledby="att-sheet-title">
      <header className="att-sheet-head">
        <div>
          <span className="label-upper">{weekday(lesson.date)}, {dmy(lesson.date)} · Tiết {lesson.period} ({lesson.start}–{lesson.end})</span>
          <h2 id="att-sheet-title" className="title-md">{lesson.subjectName} – Lớp {lesson.className}</h2>
          <p className="caption muted">Giáo viên: {lesson.teacherName}{lesson.room ? ` · Phòng ${lesson.room}` : ''}</p>
        </div>
        <span className={`stamp${lesson.taken ? '' : ' stamp-soft'}`}>{lesson.taken ? 'Đã điểm danh' : 'Chưa điểm danh'}</span>
      </header>

      {editable && sheet.prefill && (
        <div className="notice amber">
          <Icon name="content_copy" />
          <div>
            <p className="notice-title">
              Đã điền sẵn theo tiết {sheet.prefill.period} – {sheet.prefill.subjectName} ({sheet.prefill.teacherName})
            </p>
            <p>Trạng thái và ghi chú được chép nguyên từ tiết đó. Kiểm tra lại từng em rồi bấm Lưu để xác nhận; tiết này chưa được tính là đã điểm danh cho đến khi lưu.</p>
          </div>
        </div>
      )}
      {editable ? (
        <div className="notice ink">
          <Icon name="info" />
          <p>{MODE_TEXT[mode](lesson.deadline)}</p>
        </div>
      ) : (
        <div className="notice">
          <Icon name="visibility" />
          <p>{BLOCKED_TEXT[sheet.blocked] ?? BLOCKED_TEXT.MSG_ATTENDANCE_VIEW_ONLY}</p>
        </div>
      )}

      <div className="att-sheet-bar">
        <p className="caption att-counts">
          {STATUS_ORDER.map((k) => (
            <span key={k}>
              {STATUS[k].label}: <strong className="mono">{counts[k]}</strong>
            </span>
          ))}
          {counts.none > 0 && (
            <span>
              Chưa có: <strong className="mono">{counts.none}</strong>
            </span>
          )}
        </p>
        {(mode === 'TEACHER' || mode === 'MANAGER') && (
          <button type="button" className="btn btn-secondary" onClick={allPresent}>
            <Icon name="done_all" size="sm" /> Tất cả có mặt
          </button>
        )}
      </div>

      {sheet.students.length === 0 ? (
        <p className="muted">Lớp chưa có học sinh vào ngày này.</p>
      ) : (
        <ol className="att-list">
          {sheet.students.map((s, i) => {
            const d = draft[s.enrollmentId] ?? { status: null, note: '' };
            const rowChanged = changed.includes(s);
            return (
              <li key={s.enrollmentId} className={`att-row${rowChanged ? ' is-changed' : ''}`}>
                <span className="att-no mono">{i + 1}</span>
                <div className="att-who">
                  <strong>{s.fullName}</strong>
                  <span className="caption muted">
                    {s.studentCode}
                    {!s.onRoll && ' · Không còn trong lớp vào ngày này'}
                  </span>
                </div>
                {editable && (mode !== 'HOMEROOM' || ABSENCES.includes(s.status)) ? (
                  <div className="att-seg" role="radiogroup" aria-label={`Trạng thái của ${s.fullName}`}>
                    {STATUS_ORDER.filter((k) => mode !== 'HOMEROOM' || ABSENCES.includes(k)).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={d.status === k}
                        className={`att-seg-btn is-${STATUS[k].tone}${d.status === k ? ' is-on' : ''}`}
                        disabled={!canPick(s, k) || saving}
                        onClick={() => setStatus(s.enrollmentId, k)}
                      >
                        {STATUS[k].short}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="att-status-view">
                    <StatusTag status={s.status} />
                  </div>
                )}
                {editable && mode !== 'HOMEROOM' ? (
                  <input
                    className="input att-note"
                    value={d.note}
                    maxLength={500}
                    placeholder="Ghi chú"
                    aria-label={`Ghi chú cho ${s.fullName}`}
                    onChange={(e) => setNote(s.enrollmentId, e.target.value)}
                    disabled={saving}
                  />
                ) : (
                  <span className="att-note-view caption">{s.note}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {editable && sheet.reasonRequired && (
        <label className="field" htmlFor="att-reason">
          <span className="field-label">
            Lý do thay đổi<span className="required">*</span>
          </span>
          <textarea
            id="att-reason"
            className="input att-reason"
            rows={2}
            maxLength={255}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={mode === 'HOMEROOM' ? 'Ví dụ: Phụ huynh gọi điện xin phép ngày 18/11' : 'Ví dụ: Nhập bù theo sổ đầu bài'}
          />
        </label>
      )}

      {formError && <p className="form-error" role="alert">{formError}</p>}

      <footer className="att-sheet-foot">
        <button type="button" className="btn btn-tertiary" onClick={toggleHistory} disabled={!lesson.taken}>
          <Icon name="history" size="sm" /> {history ? 'Ẩn lịch sử' : 'Lịch sử thay đổi'}
        </button>
        {editable && (
          <>
            <span className="caption muted push">{changed.length ? `${changed.length} học sinh có thay đổi` : ''}</span>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
              <Icon name="save" size="sm" /> {saving ? 'Đang lưu…' : lesson.taken ? 'Lưu thay đổi' : 'Lưu điểm danh'}
            </button>
          </>
        )}
      </footer>

      {history && (
        <div className="att-history">
          <h3 className="title-sm">Lịch sử thay đổi</h3>
          {history.length === 0 ? (
            <p className="muted">Chưa có thay đổi nào.</p>
          ) : (
            <ul className="plain-list">
              {history.map((h) => (
                <li key={h.historyId} className="att-history-item">
                  <span className="caption muted mono">{fmtDateTime(h.changedAt)}</span>
                  <span>
                    <strong>{h.studentName}</strong>: {h.oldStatus ? `${STATUS[h.oldStatus]?.label} → ` : ''}
                    {STATUS[h.newStatus]?.label}
                  </span>
                  <span className="caption muted">
                    bởi {h.changedByName}
                    {h.reason ? ` · Lý do: ${h.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
