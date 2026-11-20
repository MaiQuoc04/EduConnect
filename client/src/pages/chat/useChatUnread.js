import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';

// Badge of "Trò chuyện" in the menu (20/11/2026): how many messages of all my chats I have not read yet, the same
// count as the conversation list (GET /conversations/unread-count sums its per-chat counts). Read again, after a short
// pause, on every chat event: a new message, my own read receipt (this or another tab), a delete for everyone, a
// hidden message, a team change, a role switch or a reconnection. The pause also merges "new message" + "read" when
// the message arrives in the chat that is open, so the badge does not blink.
const PAUSE_MS = 400;

export function useChatUnreadTotal(enabled) {
  const socket = useSocket();
  const { user, activeRole } = useAuth();
  const me = user?.id;
  const [count, setCount] = useState(0);
  const timer = useRef(null);

  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .get('/conversations/unread-count')
        .then(({ data }) => setCount(data.unreadCount))
        .catch(() => {}); // the menu still works without the badge
    }, PAUSE_MS);
  }, []);

  useEffect(() => {
    setCount(0);
    if (enabled) refresh();
    return () => clearTimeout(timer.current);
  }, [enabled, activeRole, refresh]);

  useEffect(() => {
    if (!socket || !enabled) return undefined;
    // Every new message, mine too: mine may show a hidden chat again (UC-132) with its older unread messages.
    const onNew = () => refresh();
    const onRead = ({ userId }) => userId === me && refresh();
    const others = [
      'message:deleted',
      'message:hidden',
      'chat:access-changed',
      'group:changed',
      'group:removed',
      'conversation:hidden', // UC-132: a hidden chat leaves the badge, shown again it comes back
      'connect',
    ];
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    others.forEach((e) => socket.on(e, refresh));
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
      others.forEach((e) => socket.off(e, refresh));
    };
  }, [socket, enabled, me, refresh]);

  return enabled ? count : 0;
}
