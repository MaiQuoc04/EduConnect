import { useCallback, useEffect, useRef, useState } from 'react';
import { getReportSummary, MODERATION_CHANGED } from '../../api/moderation.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';

// Badge of "Quy chuẩn cộng đồng" in the menu (moderation phase 6, FE-08 Anh): message reports waiting, highlighted when
// one of them is "Cần được hỗ trợ". Read again on 'moderation:report' (a new support request, real time), on a
// reconnection, and when a decision is taken on the page (MODERATION_CHANGED). School Manager only (enabled).
const PAUSE_MS = 300;
const POLL_MS = 60_000;

export function useModerationBadge(enabled) {
  const socket = useSocket();
  const { activeRole } = useAuth();
  const [summary, setSummary] = useState({ pendingCount: 0, supportCount: 0 });
  const timer = useRef(null);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      getReportSummary()
        .then((data) => setSummary({ pendingCount: data.pendingCount, supportCount: data.supportCount }))
        .catch(() => {}); // the menu still works without the badge
    }, PAUSE_MS);
  }, []);

  useEffect(() => {
    setSummary({ pendingCount: 0, supportCount: 0 });
    if (!enabled) return undefined;
    refresh();
    window.addEventListener(MODERATION_CHANGED, refresh);
    // Ordinary reports send no real-time event (only "Cần được hỗ trợ" does): read again every minute.
    const poll = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(timer.current);
      clearInterval(poll);
      window.removeEventListener(MODERATION_CHANGED, refresh);
    };
  }, [enabled, activeRole, refresh]);

  useEffect(() => {
    if (!socket || !enabled) return undefined;
    socket.on('moderation:report', refresh);
    socket.on('connect', refresh);
    return () => {
      socket.off('moderation:report', refresh);
      socket.off('connect', refresh);
    };
  }, [socket, enabled, refresh]);

  return enabled ? summary : { pendingCount: 0, supportCount: 0 };
}
