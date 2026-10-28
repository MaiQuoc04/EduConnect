import { useEffect, useState } from 'react';
import { currentMaintenance } from '../../api/admin.js';
import Icon from '../../components/Icon.jsx';
import { formatDateTime } from './format.js';
import './admin.css';

// UC-100: banner shown to every signed-in user from the moment a maintenance window is published until it ends.
// Re-checked every 5 minutes. Can be hidden for the current window only.
const HIDDEN_KEY = 'educonnect.maintenanceHidden';

export default function MaintenanceBanner() {
  const [m, setM] = useState(null);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(HIDDEN_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let alive = true;
    const load = () =>
      currentMaintenance()
        .then((data) => alive && setM(data))
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!m) return null;
  const key = `${m.id}:${m.startAt}:${m.endAt}`;
  if (hidden === key && m.state !== 'RUNNING') return null;

  function hide() {
    try {
      sessionStorage.setItem(HIDDEN_KEY, key);
    } catch {
      // storage unavailable: hide for this page view only
    }
    setHidden(key);
  }

  return (
    <div className={`maintenance-banner${m.state === 'RUNNING' ? ' running' : ''}`} role="status">
      <Icon name="engineering" />
      <p>
        <strong>{m.state === 'RUNNING' ? 'Hệ thống đang bảo trì' : 'Sắp bảo trì hệ thống'}:</strong> {m.title}, từ{' '}
        {formatDateTime(m.startAt)} đến {formatDateTime(m.endAt)}. {m.message}
      </p>
      {m.state !== 'RUNNING' && (
        <button type="button" className="btn btn-icon" onClick={hide} aria-label="Ẩn thông báo">
          <Icon name="close" size="sm" />
        </button>
      )}
    </div>
  );
}
