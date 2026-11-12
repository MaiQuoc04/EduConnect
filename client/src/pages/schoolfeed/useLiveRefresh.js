import { useEffect, useRef, useState } from 'react';

// FE-08 real time, safety net shared by SCR-02 School Feed and SCR-05 School Post Detail (same idea as FE-06 chat):
//   - refresh after the socket (re)connects – a reconnect, or a NEW socket after a role switch (SocketContext);
//   - refresh when the tab is shown again (visibilitychange);
//   - poll every 60 s ONLY while the socket is down (disconnect / connect_error, e.g. a token that expired: the
//     server refuses the reconnect and Socket.io stops trying) and the tab is visible; stops as soon as it connects.
// Only listeners this hook added are removed (the socket is shared with the chat: never off(event) without a
// handler, never disconnect()).
const POLL_MS = 60_000;

/**
 * @param {import('socket.io-client').Socket | null} socket from useSocket()
 * @param {(reason: 'connect' | 'visible' | 'poll') => void} refresh reads the screen's data again, quietly
 */
export function useLiveRefresh(socket, refresh) {
  const refreshRef = useRef(refresh);
  const hadSocket = useRef(false);
  const [online, setOnline] = useState(Boolean(socket?.connected));
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');

  useEffect(() => {
    refreshRef.current = refresh;
  });

  // Connection state. The first connect of the first socket is the page's own start (its data is being loaded
  // anyway), every later connect means "events may have been missed".
  useEffect(() => {
    if (!socket) {
      setOnline(false);
      return undefined;
    }
    const firstSocket = !hadSocket.current;
    hadSocket.current = true;
    let skipNextConnect = firstSocket && !socket.connected;
    setOnline(socket.connected);
    if (!firstSocket && socket.connected) refreshRef.current('connect');
    const onConnect = () => {
      setOnline(true);
      if (skipNextConnect) {
        skipNextConnect = false;
        return;
      }
      refreshRef.current('connect');
    };
    const onDown = () => setOnline(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDown);
    socket.on('connect_error', onDown);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDown);
      socket.off('connect_error', onDown);
    };
  }, [socket]);

  useEffect(() => {
    const onVisibility = () => {
      const shown = document.visibilityState !== 'hidden';
      setVisible(shown);
      if (shown) refreshRef.current('visible');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (online || !visible) return undefined;
    const timer = setInterval(() => refreshRef.current('poll'), POLL_MS);
    return () => clearInterval(timer);
  }, [online, visible]);
}
