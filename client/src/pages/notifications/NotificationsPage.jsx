import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/notifications.js';
import Icon from '../../components/Icon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorText } from '../../messages.js';
import { fullTime, kindOf, timeAgo, useNotificationSignals } from './notificationShared.js';
import './notifications.css';

// SCR-04 Notifications (FE-09 UC-67, Stitch SCR-38). Newest first (lead 18/11/2026: no priority groups).
//   Tab "Quan trọng" (default): personal notifications with their detail (business rules §9).
//   Tab "Tất cả": everything the bell shows, also the older general ones.
// Parents filter by child (chips, Stitch child colours). "Chỉ chưa đọc", "Đánh dấu đã đọc tất cả" (what is shown).
// A click marks the row read and opens its item; a row without an item (maintenance) only shows its text.
// Only the active role's notifications (patch_v0.3_notification_roles.sql). Mobile layout (screens.md).
const PAGE_SIZE = 20;
const CHILD_TONES = ['teal', 'coral', 'blue', 'olive'];

export default function NotificationsPage() {
  const { activeRole } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'all' ? 'all' : 'personal';
  const unread = params.get('unread') === '1';
  const studentId = params.get('studentId') ?? '';
  const focus = params.get('focus') ?? '';
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, String(v)) : next.delete(k));
    setParams(next, { replace: true });
  };

  const [state, setState] = useState({ loading: true, items: [], total: 0, unreadCount: 0, children: [], error: '' });
  const [pages, setPages] = useState(1);
  const [reload, setReload] = useState(0);
  const query = useCallback(
    (page) => ({
      personal: tab === 'personal' ? 1 : undefined,
      unread: unread ? 1 : undefined,
      studentId: studentId || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [tab, unread, studentId],
  );

  // Pages 1..pages, read again together (after a signal the shown rows stay in place and get their new state).
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    Promise.all(Array.from({ length: pages }, (_, i) => listNotifications(query(i + 1))))
      .then((all) => {
        if (!alive) return;
        const last = all[all.length - 1];
        setState({
          loading: false,
          items: all.flatMap((d) => d.items),
          total: last.total,
          unreadCount: last.unreadCount,
          children: last.children,
          error: '',
        });
      })
      .catch((err) => alive && setState((s) => ({ ...s, loading: false, error: errorText(err) })));
    return () => {
      alive = false;
    };
  }, [query, pages, reload, activeRole]);
  useEffect(() => setPages(1), [tab, unread, studentId, activeRole]);
  useNotificationSignals(() => setReload((n) => n + 1));

  // ?focus=<id> (a bell row without an item): scroll to it once it is shown.
  const focused = useRef(null);
  useEffect(() => {
    if (focus && focused.current) focused.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, state.items]);

  async function openItem(n) {
    if (!n.readAt) {
      try {
        await markNotificationRead(n.notificationId);
      } catch {
        // the item still opens; the badge catches up on the next signal
      }
    }
    if (n.link) navigate(n.link);
    else setReload((x) => x + 1);
  }

  async function readAll() {
    try {
      const r = await markAllNotificationsRead({ personal: tab === 'personal', studentId: studentId || undefined });
      toast(r.marked ? `Đã đánh dấu ${r.marked} thông báo là đã đọc.` : 'Không còn thông báo chưa đọc.');
      setReload((x) => x + 1);
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    }
  }

  const tones = new Map(state.children.map((c, i) => [String(c.studentId), CHILD_TONES[i % CHILD_TONES.length]]));
  const unreadShown = state.items.filter((n) => !n.readAt).length;

  return (
    <div className="nt-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span>EduConnect</span>/<span className="current">Thông báo</span>
      </nav>
      <div className="page-header">
        <div>
          <h1 className="headline-lg">Thông báo</h1>
          <p>Thông báo mới nhất ở trên cùng. Bấm vào một thông báo để mở nội dung liên quan.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={readAll} disabled={!unreadShown && !state.unreadCount}>
          <Icon name="done_all" size="sm" /> Đánh dấu đã đọc tất cả
        </button>
      </div>

      <div className="nt-toolbar">
        <div className="tabs" role="tablist" aria-label="Loại thông báo">
          <button type="button" role="tab" aria-selected={tab === 'personal'} onClick={() => update({ tab: null, focus: null })}>
            Quan trọng
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => update({ tab: 'all', focus: null })}>
            Tất cả
          </button>
        </div>
        <label className="nt-check">
          <input type="checkbox" checked={unread} onChange={(e) => update({ unread: e.target.checked ? '1' : null })} />
          Chỉ chưa đọc
        </label>
        <span className="caption muted nt-count">
          <span className="nb-dot is-on" aria-hidden="true" /> {state.unreadCount} chưa đọc
        </span>
      </div>

      {activeRole === 'PARENT' && state.children.length > 0 && (
        <div className="nt-chips" role="tablist" aria-label="Lọc theo con">
          <button type="button" role="tab" aria-selected={!studentId} className={`nt-chip${!studentId ? ' is-on' : ''}`} onClick={() => update({ studentId: null })}>
            Tất cả các con
          </button>
          {state.children.map((c) => (
            <button
              key={c.studentId}
              type="button"
              role="tab"
              aria-selected={String(c.studentId) === studentId}
              className={`nt-chip${String(c.studentId) === studentId ? ' is-on' : ''}`}
              onClick={() => update({ studentId: c.studentId })}
            >
              <span className={`nt-child-dot is-${tones.get(String(c.studentId))}`} aria-hidden="true" />
              {c.fullName}
              {c.className ? ` (${c.className})` : ''}
            </button>
          ))}
        </div>
      )}

      {state.error && <p className="form-error" role="alert">{state.error}</p>}

      <section className={`card card-outline nt-list${state.loading ? ' is-refreshing' : ''}`} aria-label="Danh sách thông báo">
        {!state.loading && state.items.length === 0 && (
          <div className="nb-empty">
            <Icon name="notifications_off" />
            <p className="muted">
              {unread ? 'Không có thông báo chưa đọc.' : tab === 'personal' ? 'Chưa có thông báo quan trọng nào.' : 'Chưa có thông báo nào.'}
            </p>
          </div>
        )}
        {state.items.map((n) => {
          const kind = kindOf(n.type);
          const isFocus = String(n.notificationId) === focus;
          return (
            <article
              key={n.notificationId}
              ref={isFocus ? focused : undefined}
              className={`nt-row${n.readAt ? '' : ' is-unread'}${isFocus ? ' is-focus' : ''}`}
            >
              <span className={`nb-dot${n.readAt ? '' : ' is-on'}`} aria-label={n.readAt ? undefined : 'Chưa đọc'} />
              <span className={`nt-icon is-${kind.tone}`} aria-hidden="true">
                <Icon name={kind.icon} />
              </span>
              <div className="nt-main">
                <div className="nt-meta caption">
                  {n.studentName ? (
                    <span className={`nt-child is-${tones.get(String(n.studentId)) ?? 'teal'}`}>
                      <span className={`nt-child-dot is-${tones.get(String(n.studentId)) ?? 'teal'}`} aria-hidden="true" />
                      {n.studentName}
                    </span>
                  ) : (
                    <span className="chip">{kind.label}</span>
                  )}
                  <time dateTime={String(n.createdAt)} title={fullTime(n.createdAt)} className="muted">
                    {timeAgo(n.createdAt)}
                  </time>
                </div>
                <button type="button" className="nt-title" onClick={() => openItem(n)}>
                  {n.title}
                </button>
                {n.detail && <p className="nt-detail">{n.detail}</p>}
                {n.link && (
                  <button type="button" className="link-button nt-open" onClick={() => openItem(n)}>
                    Xem chi tiết <Icon name="arrow_forward" size="sm" />
                  </button>
                )}
                {!n.link && !n.readAt && (
                  <button type="button" className="link-button nt-open" onClick={() => openItem(n)}>
                    Đánh dấu đã đọc
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {state.items.length < state.total && (
        <div className="nt-more">
          <button type="button" className="btn btn-secondary" onClick={() => setPages((p) => p + 1)} disabled={state.loading}>
            Xem thêm ({state.total - state.items.length})
          </button>
        </div>
      )}
    </div>
  );
}
