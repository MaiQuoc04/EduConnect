import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getActivities } from '../../api/extracurricular.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { errorText } from '../../messages.js';
import { at, countText, stateOf, whenText } from './activityUtils.js';
import './extracurricular.css';

// FE-07 "Ngoại khoá": the activities of one class – homeroom classes (teacher), own class (student), children's
// classes (parent). Upcoming first, then past / cancelled. Opens the detail (UC-53); the homeroom teacher creates (UC-50).

export default function ActivityListPage() {
  const { activeRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const classId = params.get('classId') ?? '';
  const status = params.get('status') === 'past' ? 'past' : 'upcoming';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await getActivities({ classId: classId || undefined, status }));
    } catch (err) {
      setError(errorText(err));
    }
  }, [classId, status]);
  useEffect(() => { load(); }, [load]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const cls = data?.classes.find((c) => String(c.classId) === String(data.classId));
  const isParent = activeRole === 'PARENT';

  return (
    <div className="xa-page">
      <nav className="xa-crumb" aria-label="Breadcrumb"><span>EduConnect</span><span>/</span><strong>Ngoại khoá</strong></nav>
      <div className="xa-head">
        <div>
          <span className="label-upper xa-kicker">Hoạt động ngoại khoá{cls ? ` · ${cls.className}` : ''}</span>
          <h1 className="headline-lg">Hoạt động ngoại khoá</h1>
          <p className="muted">
            {activeRole === 'TEACHER' && 'Đăng hoạt động trải nghiệm lên bảng tin lớp chủ nhiệm, theo dõi và xuất danh sách đăng ký.'}
            {activeRole === 'PARENT' && 'Đăng ký cho con các hoạt động của lớp trước hạn đăng ký.'}
            {activeRole === 'STUDENT' && 'Các hoạt động của lớp. Phụ huynh là người đăng ký cho bạn.'}
          </p>
        </div>
        {data?.canCreate && (
          <Link to={`/extracurricular/new?classId=${data.classId}`} className="btn btn-primary">
            <Icon name="add" size="sm" /> Tạo hoạt động
          </Link>
        )}
      </div>

      {error && <div className="notice amber" role="alert"><Icon name="error_outline" /><div><p>{error}</p><button type="button" className="btn btn-secondary" onClick={load}>Thử lại</button></div></div>}
      {!data && !error && <p className="muted" aria-busy="true">Đang tải…</p>}

      {data && !data.classes.length && (
        <div className="notice"><Icon name="info" /><p>
          {activeRole === 'TEACHER' ? 'Bạn chưa chủ nhiệm lớp nào nên chưa có hoạt động ngoại khoá để quản lý.'
            : isParent ? 'Tài khoản chưa liên kết với học sinh nào đang học.' : 'Bạn chưa thuộc lớp nào.'}
        </p></div>
      )}

      {data && data.classes.length > 0 && (
        <>
          <div className="xa-toolbar">
            <label className="xa-select">
              <span className="label-upper">{isParent ? 'Lớp của con' : 'Lớp'}</span>
              <select className="input" value={String(data.classId)} onChange={(e) => setParam('classId', e.target.value)}>
                {data.classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.className}{c.children.length ? ` – ${c.children.join(', ')}` : ''}{c.yearEnded ? ' (năm học đã kết thúc)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {cls?.groupId && (
              <Link to={`/groups/${cls.groupId}/feed`} className="btn btn-secondary xa-feed-link">
                <Icon name="forum" size="sm" /> Bảng tin lớp {cls.className}
              </Link>
            )}
            <div className="pill-tabs" role="tablist" aria-label="Thời gian">
              <button type="button" role="tab" aria-selected={status === 'upcoming'} className={`xa-tab${status === 'upcoming' ? ' is-on' : ''}`} onClick={() => setParam('status', '')}>
                Sắp tới ({data.counts.upcoming})
              </button>
              <button type="button" role="tab" aria-selected={status === 'past'} className={`xa-tab${status === 'past' ? ' is-on' : ''}`} onClick={() => setParam('status', 'past')}>
                Đã qua / đã huỷ ({data.counts.past})
              </button>
            </div>
          </div>
          {cls?.yearEnded && <div className="notice"><Icon name="lock" /><p>Năm học của lớp này đã kết thúc: chỉ xem lại, không tạo hay đăng ký được nữa.</p></div>}

          {data.items.length === 0 ? (
            <div className="xa-empty">
              <Icon name="hiking" />
              <p>{status === 'past' ? 'Chưa có hoạt động nào đã qua.' : 'Chưa có hoạt động sắp tới.'}</p>
              {data.canCreate && status === 'upcoming' && <Link to={`/extracurricular/new?classId=${data.classId}`} className="btn btn-secondary">Tạo hoạt động đầu tiên</Link>}
            </div>
          ) : (
            <ul className="xa-list">
              {data.items.map((a) => {
                const st = stateOf(a);
                return (
                  <li key={a.eventId}>
                    <Link to={`/extracurricular/${a.eventId}`} className={`xa-item${st.key === 'cancelled' ? ' is-cancelled' : ''}`}>
                      <div className="xa-item-date">
                        <strong>{a.startAt.slice(8, 10)}</strong>
                        <span>Th{a.startAt.slice(5, 7)}</span>
                      </div>
                      <div className="xa-item-main">
                        <div className="xa-item-chips">
                          <span className={`xa-chip tone-${st.tone}`}>{st.label}</span>
                          {a.isHidden && <span className="xa-chip tone-grey">Bài đang bị ẩn</span>}
                          {a.myRegistered > 0 && <span className="xa-chip tone-ink"><Icon name="check" size="sm" /> {isParent ? (a.myRegistered > 1 ? `Đã đăng ký ${a.myRegistered} con` : 'Đã đăng ký cho con') : 'Bạn đã được đăng ký'}</span>}
                        </div>
                        <h2 className="title-sm">{a.title}</h2>
                        <p className="muted caption">
                          <Icon name="schedule" size="sm" /> {whenText(a)} · <Icon name="location_on" size="sm" /> {a.location}
                        </p>
                      </div>
                      <div className="xa-item-side">
                        <span className="caption muted">Hạn đăng ký</span>
                        <strong className="xa-mono">{at(a.registrationDeadline)}</strong>
                        <span className="caption muted">Đã đăng ký {countText(a)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
