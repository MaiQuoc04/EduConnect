import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';

// FE-09 (owner: Quoc) – pieces shared by the bell and the notification pages.

// Server timestamps arrive as "2026-11-18 16:04:51.28+07" (DB time zone) or ISO from JSON aggregates.
export function toDate(value) {
  if (!value) return null;
  const s = String(value).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// "Vừa xong", "5 phút trước", "3 giờ trước", "Hôm qua 14:15", "18/11/2026 08:30".
export function timeAgo(value, now = new Date()) {
  const d = toDate(value);
  if (!d) return '';
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${Math.floor(mins / 60)} giờ trước`;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Hôm qua ${hm(d)}`;
  return `${dmy(d)} ${hm(d)}`;
}
export const fullTime = (value) => {
  const d = toDate(value);
  return d ? `${hm(d)} ${dmy(d)}` : '';
};

// Icon and tone of each notification type (Stitch SCR-38 icon boxes).
const KIND = {
  ATTENDANCE: { icon: 'how_to_reg', tone: 'red', label: 'Điểm danh' },
  EXTRACURRICULAR: { icon: 'hiking', tone: 'blue', label: 'Ngoại khoá' },
  CLASS_EVENT: { icon: 'event', tone: 'amber', label: 'Lịch lớp' },
  SCHOOL_POST: { icon: 'campaign', tone: 'ink', label: 'Bảng tin trường' },
  GROUP_POST: { icon: 'forum', tone: 'ink', label: 'Bảng tin nhóm' },
  MAINTENANCE: { icon: 'engineering', tone: 'amber', label: 'Bảo trì hệ thống' },
  SYSTEM: { icon: 'shield_person', tone: 'graphite', label: 'Hệ thống' },
};
export const kindOf = (type) => KIND[type] ?? { icon: 'notifications', tone: 'graphite', label: 'Thông báo' };

// Calls onChange when a notification of the ACTIVE role arrives or was read in another tab, and when the socket
// (re)connects – so a badge or list never misses anything.
export function useNotificationSignals(onChange) {
  const socket = useSocket();
  const { activeRole } = useAuth();
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (e) => {
      if (!e?.role || e.role === activeRole) latest.current('new', e);
    };
    const onRead = (e) => {
      if (!e?.role || e.role === activeRole) latest.current('read', e);
    };
    const onConnect = () => latest.current('connect');
    socket.on('notification:new', onNew);
    socket.on('notification:read', onRead);
    socket.on('connect', onConnect);
    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:read', onRead);
      socket.off('connect', onConnect);
    };
  }, [socket, activeRole]);
}
