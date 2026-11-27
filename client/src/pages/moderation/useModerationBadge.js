import { useCallback, useEffect, useRef, useState } from 'react';
import { listGroupCommentReports } from '../../api/groupPosts.js';
import { getReportSummary, MODERATION_CHANGED } from '../../api/moderation.js';
import { listCommentReports } from '../../api/schoolPosts.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';

// Badge of "Quy chuẩn cộng đồng" in the menu (moderation phase 6, FE-08 Anh): every report waiting that the School
// Manager handles on that page, highlighted when one of them is "Cần được hỗ trợ". Read again on 'moderation:report' (a
// new support request, real time), on a reconnection, every minute, and when a decision is taken on the page
// (MODERATION_CHANGED). School Manager only (enabled).
// FE-08 Anh 27/11/2026: comment reports joined the page (tab "Báo cáo bình luận"), so the badge adds them, with the
// existing APIs only (no new endpoint):
//   - message reports: GET /moderation/message-reports/summary → pendingCount, supportCount;
//   - school feed comments: GET /comment-reports?status=PENDING&pageSize=1 → pendingCount;
//   - teacher group comments: GET /group-comment-reports?status=PENDING&pageSize=1 → pendingCount (the server lists
//     only the teacher group for the School Manager, never a class feed).
// "Cần được hỗ trợ" in a comment queue: the server sorts PENDING with has_needs_support first
// (utils/commentReports.js listReports), so the queue has one exactly when its first item has one.
const PAUSE_MS = 300;
const POLL_MS = 60_000;
const EMPTY = { pendingCount: 0, hasSupport: false, messagePending: 0, commentPending: 0 };
const FIRST_PENDING = { status: 'PENDING', page: 1, pageSize: 1 };

// One comment queue: { pending, support }; a queue that fails counts as empty (the menu still works).
const commentQueue = (settled) =>
  settled.status === 'fulfilled'
    ? { pending: settled.value.pendingCount ?? 0, support: Boolean(settled.value.items?.[0]?.hasNeedsSupport) }
    : { pending: 0, support: false };

export function useModerationBadge(enabled) {
  const socket = useSocket();
  const { activeRole } = useAuth();
  const [summary, setSummary] = useState(EMPTY);
  const timer = useRef(null);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Promise.allSettled([
        getReportSummary(),
        listCommentReports(FIRST_PENDING),
        listGroupCommentReports(FIRST_PENDING),
      ]).then(([messages, school, teacher]) => {
        if ([messages, school, teacher].every((r) => r.status === 'rejected')) return; // keep the last known badge
        const msg = messages.status === 'fulfilled' ? messages.value : { pendingCount: 0, supportCount: 0 };
        const queues = [commentQueue(school), commentQueue(teacher)];
        const commentPending = queues.reduce((n, q) => n + q.pending, 0);
        setSummary({
          pendingCount: msg.pendingCount + commentPending,
          hasSupport: msg.supportCount > 0 || queues.some((q) => q.support),
          messagePending: msg.pendingCount,
          commentPending,
        });
      });
    }, PAUSE_MS);
  }, []);

  useEffect(() => {
    setSummary(EMPTY);
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

  return enabled ? summary : EMPTY;
}
