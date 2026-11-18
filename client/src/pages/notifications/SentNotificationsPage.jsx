import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSentNotification, listSentNotifications } from '../../api/notifications.js';
import Icon from '../../components/Icon.jsx';
import { errorText, ROLE_LABELS } from '../../messages.js';
import { fullTime, timeAgo } from './notificationShared.js';
import './notifications.css';

// FE-09 UC-68 View Notification Read Status (teacher; lead 18/11/2026: class events and extracurricular activities the
// teacher created – not school posts). Each item lists its notifications (creation, reminder, change, cancel…) with
// how many have read it; "Ai chưa đọc" opens the people who have not, unread first, to remind them.
const PAGE_SIZE = 10;
const ITEM_KIND = {
  CLASS_EVENT: { label: 'Sự kiện lớp', icon: 'event', link: (id) => `/calendar/events/${id}` },
  EXTRACURRICULAR_EVENT: { label: 'Hoạt động ngoại khoá', icon: 'hiking', link: (id) => `/extracurricular/${id}` },
};

function Readers({ notificationId }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    let alive = true;
    getSentNotification(notificationId)
      .then((data) => alive && setState({ loading: false, data, error: '' }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [notificationId]);
  if (state.loading) return <p className="muted ns-pad">Đang tải…</p>;
  if (state.error) return <p className="form-error ns-pad">{state.error}</p>;
  const { recipients, counts } = state.data;
  const unread = recipients.filter((r) => !r.readAt);
  const read = recipients.filter((r) => r.readAt);
  const row = (r) => (
    <li key={`${r.userId}-${r.role}`} className="ns-person">
      <span className={`nb-dot${r.readAt ? '' : ' is-on'}`} aria-hidden="true" />
      <span className="ns-person-main">
        <strong>{r.fullName}</strong>
        <span className="caption muted">
          {ROLE_LABELS[r.role] ?? r.role}
          {r.studentName ? ` của ${r.studentName}` : ''}
          {r.phone ? ` · ${r.phone}` : ''}
        </span>
      </span>
      <span className="caption muted">{r.readAt ? `Đã đọc ${timeAgo(r.readAt)}` : 'Chưa đọc'}</span>
    </li>
  );
  return (
    <div className="ns-readers">
      <p className="caption">
        Đã đọc <strong className="mono">{counts.read}</strong>/<span className="mono">{counts.total}</span> người
      </p>
      {unread.length > 0 ? (
        <>
          <h4 className="label-upper ns-sub">Chưa đọc ({unread.length})</h4>
          <ul className="plain-list ns-people">{unread.map(row)}</ul>
        </>
      ) : (
        <p className="muted">Mọi người đã đọc thông báo này.</p>
      )}
      {read.length > 0 && (
        <details className="ns-read-list">
          <summary className="caption">Đã đọc ({read.length})</summary>
          <ul className="plain-list ns-people">{read.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

export default function SentNotificationsPage() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, items: [], total: 0, error: '' });
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    listSentNotifications({ page, pageSize: PAGE_SIZE })
      .then((d) => alive && setState({ loading: false, items: d.items, total: d.total, error: '' }))
      .catch((err) => alive && setState((s) => ({ ...s, loading: false, error: errorText(err) })));
    return () => {
      alive = false;
    };
  }, [page]);

  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  return (
    <div className="nt-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span>Thông báo</span>/<span className="current">Thông báo đã gửi</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Thông báo đã gửi</h1>
          <p>Thông báo về sự kiện lớp và hoạt động ngoại khoá bạn tạo: ai đã đọc, ai chưa đọc để nhắc lại.</p>
        </div>
      </div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {!state.loading && state.items.length === 0 && (
        <div className="card card-outline nb-empty">
          <Icon name="outgoing_mail" />
          <p className="muted">Bạn chưa tạo sự kiện lớp hay hoạt động ngoại khoá nào có gửi thông báo.</p>
        </div>
      )}
      <div className={`ns-items${state.loading ? ' is-refreshing' : ''}`}>
        {state.items.map((it) => {
          const kind = ITEM_KIND[it.targetType];
          return (
            <section key={`${it.targetType}-${it.targetId}`} className="card card-outline ns-item">
              <header className="ns-item-head">
                <span className="nt-icon is-ink" aria-hidden="true">
                  <Icon name={kind?.icon ?? 'notifications'} />
                </span>
                <div>
                  <span className="label-upper">
                    {kind?.label} · Lớp {it.className}
                  </span>
                  <h2 className="title-sm">
                    {kind ? <Link to={kind.link(it.targetId)}>{it.title}</Link> : it.title}
                  </h2>
                  <p className="caption muted">Diễn ra: {fullTime(it.itemAt)}</p>
                </div>
              </header>
              <ul className="plain-list ns-notes">
                {it.notifications.map((n) => {
                  const pct = n.recipients ? Math.round((n.read * 100) / n.recipients) : 0;
                  const isOpen = openId === n.notificationId;
                  return (
                    <li key={n.notificationId} className="ns-note">
                      <div className="ns-note-row">
                        <div className="ns-note-main">
                          <strong>{n.title}</strong>
                          <span className="caption muted">
                            {timeAgo(n.createdAt)} · {n.isPersonal ? 'Thông báo quan trọng' : 'Thông báo chung'}
                          </span>
                        </div>
                        <div className="ns-progress" aria-label={`Đã đọc ${n.read} trên ${n.recipients}`}>
                          <span className="ns-bar">
                            <span style={{ width: `${pct}%` }} />
                          </span>
                          <span className="caption mono">
                            {n.read}/{n.recipients}
                          </span>
                        </div>
                        <button type="button" className="btn btn-secondary" onClick={() => setOpenId(isOpen ? null : n.notificationId)} aria-expanded={isOpen}>
                          {isOpen ? 'Ẩn' : 'Ai chưa đọc'}
                        </button>
                      </div>
                      {isOpen && <Readers notificationId={n.notificationId} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {state.total > PAGE_SIZE && (
        <div className="nt-more">
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trang trước
          </button>
          <span className="caption">
            Trang {page}/{pages}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Trang sau
          </button>
        </div>
      )}
    </div>
  );
}
