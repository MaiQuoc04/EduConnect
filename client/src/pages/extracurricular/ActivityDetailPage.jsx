import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  cancelActivity, cancelChildRegistration, getActivity, registerChild,
} from '../../api/extracurricular.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { at, countText, daysLeft, REG_STATUS, stateOf, weekday, whenText } from './activityUtils.js';
import './extracurricular.css';

// UC-53 View Event Detail (homeroom teacher, students, parents) + UC-54 / UC-55 for parents (register / cancel each
// child) + UC-52 Cancel Event for the homeroom teacher. Buttons follow `can` from the server; every action is checked
// again there.

export function ConfirmDialog({ title, text, facts, confirmLabel, danger, busy, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <div className="xa-overlay" onClick={() => !busy && onCancel()}>
      <div className="xa-dialog" role="alertdialog" aria-modal="true" aria-labelledby="xa-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div className="xa-dialog-row">
          <span className={`xa-dialog-icon${danger ? ' is-danger' : ''}`}><Icon name={danger ? 'warning' : 'how_to_reg'} /></span>
          <div>
            <h2 id="xa-dialog-title">{title}</h2>
            <p>{text}</p>
          </div>
        </div>
        {facts && <dl className="xa-dialog-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        <div className="xa-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>Quay lại</button>
          <button type="button" className={`btn ${danger ? 'xa-btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActivityDetailPage() {
  const { eventId } = useParams();
  const { activeRole } = useAuth();
  const toast = useToast();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(null); // { kind: 'register' | 'unregister' | 'cancel', child? }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setA(await getActivity(eventId));
    } catch (err) {
      setError(errorText(err));
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  async function confirm() {
    setBusy(true);
    try {
      if (ask.kind === 'register') {
        setA(await registerChild(eventId, ask.child.studentId));
        toast(`Đã đăng ký cho ${ask.child.fullName}.`);
      } else if (ask.kind === 'unregister') {
        setA(await cancelChildRegistration(eventId, ask.child.studentId));
        toast(`Đã huỷ đăng ký của ${ask.child.fullName}.`);
      } else {
        const r = await cancelActivity(eventId);
        setA(r);
        toast(r.notified ? `Đã huỷ hoạt động và báo cho ${r.notified} phụ huynh đã đăng ký.` : 'Đã huỷ hoạt động.');
      }
      setAsk(null);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
      setAsk(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="xa-page">
        <div className="notice amber"><Icon name="error_outline" /><div><p>{error}</p><Link to="/extracurricular" className="btn btn-secondary">Về danh sách ngoại khoá</Link></div></div>
      </div>
    );
  }
  if (!a) return <div className="xa-page" aria-busy="true"><p className="muted">Đang tải…</p></div>;

  const st = stateOf(a);
  const left = st.key === 'open' ? daysLeft(a.registrationDeadline) : 0;
  const full = a.capacity !== null && a.registeredCount >= a.capacity;
  const isParent = activeRole === 'PARENT';
  const ratio = a.classSize ? Math.round((a.registeredCount / a.classSize) * 1000) / 10 : 0;

  return (
    <div className="xa-page xa-page-narrow">
      <nav className="xa-crumb" aria-label="Breadcrumb">
        <Link to={`/extracurricular?classId=${a.classId}`}>Ngoại khoá {a.className}</Link><span>/</span><strong>Chi tiết hoạt động</strong>
      </nav>
      <Link to={`/groups/${a.groupId}`} className="xa-back"><Icon name="arrow_back" size="sm" /> Bảng tin lớp {a.className}</Link>

      <header className="xa-hero">
        <div className="xa-hero-chips">
          <span className="label-upper xa-kicker"><Icon name="verified" size="sm" /> Sổ ngoại khoá · {a.className}</span>
          <span className={`xa-chip tone-${st.tone}`}>{st.label}{left > 0 && ` · còn ${left} ngày`}</span>
          {a.isHidden && <span className="xa-chip tone-grey">Bài trên bảng tin đang bị ẩn</span>}
        </div>
        <h1 className="headline-lg xa-hero-title">{a.title}</h1>
        <dl className="xa-hero-facts">
          <div><dt><Icon name="schedule" size="sm" /> Thời gian</dt><dd>{weekday(a.startAt)}, {whenText(a)}</dd></div>
          <div><dt><Icon name="event_busy" size="sm" /> Hạn đăng ký</dt><dd>{at(a.registrationDeadline)}</dd></div>
          <div><dt><Icon name="location_on" size="sm" /> Địa điểm</dt><dd>{a.location}</dd></div>
          <div><dt><Icon name="group" size="sm" /> Chỉ tiêu</dt><dd>{a.capacity ? `${a.capacity} học sinh` : 'Không giới hạn'}</dd></div>
        </dl>
        {(a.can.edit || a.can.cancel || a.can.viewRegistrations) && (
          <div className="xa-hero-actions">
            {a.can.viewRegistrations && (
              <Link to={`/extracurricular/${a.eventId}/registrations`} className="btn btn-primary"><Icon name="table_view" size="sm" /> Danh sách đăng ký</Link>
            )}
            {a.can.edit && <Link to={`/extracurricular/${a.eventId}/edit`} className="btn btn-secondary"><Icon name="edit" size="sm" /> Sửa hoạt động</Link>}
            {a.can.cancel && (
              <button type="button" className="btn xa-btn-text-danger" onClick={() => setAsk({ kind: 'cancel' })}>
                <Icon name="event_busy" size="sm" /> Huỷ hoạt động
              </button>
            )}
          </div>
        )}
      </header>

      {a.status === 'CANCELLED' && (
        <div className="notice amber"><Icon name="event_busy" /><p>Hoạt động đã bị huỷ lúc {at(a.cancelledAt)}. Các đăng ký không còn hiệu lực.</p></div>
      )}
      {a.isHomeroom && a.status === 'OPEN' && a.started && (
        <div className="notice"><Icon name="lock" /><p>Hoạt động đã bắt đầu nên không sửa hay huỷ được nữa.</p></div>
      )}
      {a.isHomeroom && a.yearEnded && <div className="notice"><Icon name="lock" /><p>Năm học đã kết thúc: chỉ xem lại.</p></div>}

      <div className="xa-detail-grid">
        <section className="card card-outline xa-panel">
          <h2 className="title-sm xa-panel-title"><Icon name="description" /> Mô tả &amp; dặn dò</h2>
          <p className="xa-reading">{a.description}</p>
          <p className="caption muted xa-by">
            <Icon name="person" size="sm" /> Đăng bởi {a.authorName} · {at(a.createdAt)}{a.updatedAt ? ` · sửa lúc ${at(a.updatedAt)}` : ''}
          </p>
        </section>

        <aside className="xa-side">
          <section className="card card-outline xa-panel">
            <h2 className="title-sm xa-panel-title"><Icon name="how_to_reg" /> Đăng ký</h2>
            <div className="xa-meter" aria-label={`Đã đăng ký ${countText(a)}`}>
              <div className="xa-meter-row"><span>Đã đăng ký</span><strong>{countText(a)}</strong></div>
              {a.capacity && <div className="xa-meter-bar"><i style={{ width: `${Math.min(100, (a.registeredCount / a.capacity) * 100)}%` }} /></div>}
              {a.isHomeroom && <span className="caption muted">Tỷ lệ lớp tham gia {String(ratio).replace('.', ',')}% (sĩ số {a.classSize})</span>}
            </div>

            {isParent && (
              a.registrations.length === 0 ? (
                <p className="caption muted">Không có con nào của bạn đang học lớp {a.className}.</p>
              ) : (
                <ul className="xa-children">
                  {a.registrations.map((r) => {
                    const reg = r.status === 'REGISTERED';
                    const rs = REG_STATUS[r.status ?? 'NONE'];
                    return (
                      <li key={r.studentId}>
                        <div>
                          <strong>{r.fullName}</strong>
                          <span className={`xa-chip tone-${rs.tone}`}>{rs.label}</span>
                          {reg && <span className="caption muted">{r.byMe ? 'Bạn' : r.registeredByName} đăng ký lúc {at(r.registeredAt)}</span>}
                        </div>
                        {a.can.register && (reg ? (
                          <button type="button" className="btn btn-secondary" onClick={() => setAsk({ kind: 'unregister', child: r })}>Huỷ đăng ký</button>
                        ) : (
                          <button type="button" className="btn btn-primary" disabled={full} onClick={() => setAsk({ kind: 'register', child: r })}>
                            {full ? 'Đã đủ chỉ tiêu' : 'Đăng ký'}
                          </button>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              )
            )}
            {isParent && !a.can.register && a.status === 'OPEN' && !a.yearEnded && (
              <p className="caption muted">Đã hết hạn đăng ký ({at(a.registrationDeadline)}), không đăng ký hay huỷ được nữa.</p>
            )}
            {activeRole === 'STUDENT' && a.registrations[0] && (
              <p className="xa-student-status">
                <span className={`xa-chip tone-${REG_STATUS[a.registrations[0].status ?? 'NONE'].tone}`}>{REG_STATUS[a.registrations[0].status ?? 'NONE'].label}</span>
                <span className="caption muted">
                  {a.registrations[0].status === 'REGISTERED'
                    ? `${a.registrations[0].registeredByName} đã đăng ký cho bạn lúc ${at(a.registrations[0].registeredAt)}.`
                    : 'Phụ huynh của bạn đăng ký trên EduConnect trước hạn.'}
                </span>
              </p>
            )}
          </section>
          <p className="caption muted xa-help"><Icon name="help_outline" size="sm" /> Thắc mắc về hoạt động, hãy nhắn tin cho giáo viên chủ nhiệm lớp {a.className}.</p>
        </aside>
      </div>

      {ask?.kind === 'register' && (
        <ConfirmDialog
          title={`Đăng ký cho ${ask.child.fullName}?`}
          text="Bạn có thể huỷ đăng ký trước hạn đăng ký."
          facts={[['Hoạt động:', a.title], ['Thời gian:', whenText(a)], ['Địa điểm:', a.location], ['Hạn đăng ký:', at(a.registrationDeadline)]]}
          confirmLabel="Đăng ký" busy={busy} onCancel={() => setAsk(null)} onConfirm={confirm}
        />
      )}
      {ask?.kind === 'unregister' && (
        <ConfirmDialog
          title={`Huỷ đăng ký của ${ask.child.fullName}?`}
          text={`Bạn vẫn đăng ký lại được trước ${at(a.registrationDeadline)} nếu còn chỉ tiêu.`}
          confirmLabel="Huỷ đăng ký" danger busy={busy} onCancel={() => setAsk(null)} onConfirm={confirm}
        />
      )}
      {ask?.kind === 'cancel' && (
        <ConfirmDialog
          title="Huỷ hoạt động này?"
          text={`Hoạt động sẽ hiện "Đã huỷ" trên bảng tin lớp; ${a.registeredCount ? `phụ huynh của ${a.registeredCount} học sinh đã đăng ký sẽ nhận thông báo` : 'chưa có học sinh nào đăng ký'}. Không hoàn tác được.`}
          facts={[['Hoạt động:', a.title], ['Thời gian:', whenText(a)]]}
          confirmLabel="Huỷ hoạt động" danger busy={busy} onCancel={() => setAsk(null)} onConfirm={confirm}
        />
      )}
    </div>
  );
}
