import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead } from '../api/notifications.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { errorText } from '../messages.js';
import { kindOf, timeAgo, useNotificationSignals } from '../pages/notifications/notificationShared.js';
import '../pages/notifications/notifications.css';
import Icon from './Icon.jsx';

// FE-09 UC-67: the bell of the top bar (Stitch SCR-38 "Quick View" popover, 400px). Unread count of the ACTIVE role;
// the 10 newest notifications, newest first; a click marks it read and opens its item; "Đánh dấu đã đọc";
// "Xem tất cả thông báo" opens SCR-04. Real time through useNotificationSignals.
const SHOWN = 10;

export default function NotificationBell() {
  const { activeRole } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState({ loading: false, items: null, error: '' });
  const box = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;

  const refreshCount = useCallback(() => {
    getUnreadCount()
      .then(setCount)
      .catch(() => {});
  }, []);
  const loadList = useCallback(() => {
    setList((s) => ({ ...s, loading: true, error: '' }));
    listNotifications({ pageSize: SHOWN })
      .then((d) => {
        setList({ loading: false, items: d.items, error: '' });
        setCount(d.unreadCount);
      })
      .catch((err) => setList({ loading: false, items: null, error: errorText(err) }));
  }, []);

  useEffect(() => {
    setCount(0);
    setOpen(false);
    refreshCount();
  }, [activeRole, refreshCount]);
  useNotificationSignals(() => {
    refreshCount();
    if (openRef.current) loadList();
  });

  // Outside click / Esc close the popover.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) loadList();
    setOpen((v) => !v);
  }

  async function openItem(n) {
    setOpen(false);
    if (!n.readAt) {
      markNotificationRead(n.notificationId)
        .then((r) => setCount(r.unreadCount))
        .catch(() => {});
    }
    navigate(n.link ?? `/notifications?tab=all&focus=${n.notificationId}`);
  }

  async function readAll() {
    try {
      const r = await markAllNotificationsRead({});
      setCount(r.unreadCount);
      setList((s) => ({ ...s, items: s.items?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) }));
    } catch (err) {
      toast(errorText(err), { type: 'error' });
    }
  }

  const label = count ? `Thông báo, ${count} chưa đọc` : 'Thông báo';
  return (
    <div className="nb" ref={box}>
      <button type="button" className="btn btn-icon nb-button" onClick={toggle} aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog">
        <Icon name="notifications" />
        {count > 0 && <span className="nb-badge">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="nb-pop" role="dialog" aria-label="Thông báo">
          <div className="nb-head">
            <span className="title-sm">Thông báo</span>
            {count > 0 && <span className="nb-new">{count} mới</span>}
            <button type="button" className="link-button nb-readall" onClick={readAll} disabled={!count}>
              Đánh dấu đã đọc
            </button>
          </div>
          <div className="nb-body">
            {list.error && <p className="form-error nb-pad">{list.error}</p>}
            {!list.items && !list.error && <p className="muted nb-pad">Đang tải…</p>}
            {list.items?.length === 0 && (
              <div className="nb-empty">
                <Icon name="notifications_off" />
                <p className="muted">Chưa có thông báo nào.</p>
              </div>
            )}
            {list.items?.map((n) => {
              const kind = kindOf(n.type);
              return (
                <button key={n.notificationId} type="button" className={`nb-item${n.readAt ? '' : ' is-unread'}`} onClick={() => openItem(n)}>
                  <span className={`nb-dot${n.readAt ? '' : ' is-on'}`} aria-hidden="true" />
                  <span className={`nt-icon is-${kind.tone}`} aria-hidden="true">
                    <Icon name={kind.icon} size="sm" />
                  </span>
                  <span className="nb-text">
                    <span className="nb-meta caption">
                      <span>{n.studentName ?? kind.label}</span>
                      <span className="muted">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="nb-title">{n.title}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="nb-foot">
            <Link to="/notifications" onClick={() => setOpen(false)} className="nb-all">
              Xem tất cả thông báo <Icon name="arrow_forward" size="sm" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
