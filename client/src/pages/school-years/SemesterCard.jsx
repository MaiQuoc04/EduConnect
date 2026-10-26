import { useState } from 'react';
import { api } from '../../api/client.js';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { formatDate } from '../../utils/format.js';
import { semesterStatus } from './schoolYearLabels.js';

// One semester on SCR-18 (UC-21): dates, status, and the School Manager's actions – edit the dates,
// close the semester (ends homeroom attendance corrections), reopen it.
export default function SemesterCard({ yearId, semester, onChanged }) {
  const toast = useToast();
  const [mode, setMode] = useState('view'); // view | edit | close | reopen
  const [dates, setDates] = useState({ startDate: semester.startDate, endDate: semester.endDate });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const status = semesterStatus(semester);
  const name = `Học kỳ ${semester.semesterNo}`;
  const base = `/school-years/${yearId}/semesters/${semester.semesterId}`;

  function open(next) {
    setDates({ startDate: semester.startDate, endDate: semester.endDate });
    setError('');
    setMode(next);
  }

  async function run(request, message) {
    setBusy(true);
    setError('');
    try {
      const { data } = await request();
      setMode('view');
      toast(message);
      onChanged(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function save(e) {
    e.preventDefault();
    if (!dates.startDate || !dates.endDate) {
      setError(errorText({ code: 'MSG_REQUIRED' }));
      return;
    }
    run(() => api.put(base, dates), `Đã lưu thời gian ${name}.`);
  }

  return (
    <article className="card card-outline semester-card">
      <div className="semester-card-top">
        <span className="title-sm">{name}</span>
        <span className={`pill ${status.pill}`}>{status.label}</span>
        <span className="semester-dates mono">
          <Icon name="schedule" size="sm" />
          {formatDate(semester.startDate)} – {formatDate(semester.endDate)}
        </span>
      </div>

      {mode === 'edit' ? (
        <form className="semester-edit" onSubmit={save} noValidate>
          <div className="year-form-dates">
            <label className="field">
              <span className="field-label">Ngày bắt đầu</span>
              <input
                type="date"
                className="input"
                value={dates.startDate}
                onChange={(e) => setDates((d) => ({ ...d, startDate: e.target.value }))}
              />
            </label>
            <label className="field">
              <span className="field-label">Ngày kết thúc</span>
              <input
                type="date"
                className="input"
                value={dates.endDate}
                onChange={(e) => setDates((d) => ({ ...d, endDate: e.target.value }))}
              />
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="card-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setMode('view')} disabled={busy}>
              Huỷ
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu thời gian'}
            </button>
          </div>
        </form>
      ) : (
        <div className="semester-card-body">
          <p className="semester-meta">
            <Icon name="view_timeline" size="sm" />
            {semester.weekCount} tuần
            {semester.currentWeek && <span className="chip ink">Tuần {semester.currentWeek}/{semester.weekCount}</span>}
          </p>
          {mode === 'view' && (
            <div className="actions-row push">
              {semester.canEdit && (
                <button type="button" className="btn btn-secondary" onClick={() => open('edit')}>
                  Sửa
                </button>
              )}
              {semester.status === 'OPEN' && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => open('close')}
                  disabled={!semester.canClose}
                >
                  <Icon name="lock" size="sm" />
                  Đóng học kỳ
                </button>
              )}
              {semester.canReopen && (
                <button type="button" className="btn btn-secondary" onClick={() => open('reopen')}>
                  <Icon name="lock_open" size="sm" />
                  Mở lại học kỳ
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'view' && semester.status === 'OPEN' && !semester.canClose && (
        <p className="caption muted">Có thể đóng học kỳ sau ngày {formatDate(semester.endDate)}.</p>
      )}

      {mode === 'close' && (
        <div className="confirm-box amber">
          <div className="confirm-head">
            <Icon name="warning" />
            <div>
              <p className="notice-title">Đóng {name}?</p>
              <p>
                Sau khi đóng, giáo viên chủ nhiệm không thể chuyển vắng có phép / không phép cho các ngày thuộc học kỳ
                này nữa. Quản lý trường học vẫn sửa được điểm danh. Thao tác này không ảnh hưởng đến điểm.
              </p>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="card-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setMode('view')} disabled={busy}>
              Huỷ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => api.post(`${base}/close`), `Đã đóng ${name}.`)}
            >
              <Icon name="lock" size="sm" />
              {busy ? 'Đang đóng…' : `Đóng ${name}`}
            </button>
          </div>
        </div>
      )}

      {mode === 'reopen' && (
        <div className="confirm-box ink">
          <div className="confirm-head">
            <Icon name="lock_open" />
            <div>
              <p className="notice-title">Mở lại {name}?</p>
              <p>Giáo viên chủ nhiệm sẽ lại được chuyển vắng có phép / không phép cho các ngày thuộc học kỳ này.</p>
            </div>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="card-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setMode('view')} disabled={busy}>
              Huỷ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => api.post(`${base}/reopen`), `Đã mở lại ${name}.`)}
            >
              {busy ? 'Đang mở…' : `Mở lại ${name}`}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
