import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { tokenStore } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);
const SocketStatusContext = createContext('connecting');

// One Socket.io connection per signed-in session (FE-06 chat, later FE-09 notifications). The server puts it in the
// room "user:<id>". It reconnects with the new token when the user switches role, so the server always knows the
// active role. Usage: const socket = useSocket(); socket?.on('message:new', handler) (null while signed out).
// useSocketStatus() (17/11/2026, FE-06): 'connecting' | 'connected' | 'disconnected', for the chat's connection bar.
// Missed events: listen to the socket's 'connect' event (first connection, every reconnection, and the new socket after
// a role switch) and read again what may have been missed.
export function SocketProvider({ children }) {
  const { user, activeRole } = useAuth();
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('connecting');
  const userId = user?.id;

  useEffect(() => {
    const token = tokenStore.get();
    if (!userId || !token) return undefined;
    // Production: the frontend (Vercel) and the API server are on different domains, so VITE_SOCKET_URL names the API
    // server. Development: unset, connect to the same origin and Vite forwards /socket.io to the API server.
    const url = import.meta.env.VITE_SOCKET_URL;
    const opts = { auth: { token }, transports: ['websocket', 'polling'] };
    const s = url ? io(url, opts) : io(opts);
    const connected = () => setStatus('connected');
    const lost = () => setStatus('disconnected');
    s.on('connect', connected);
    s.on('disconnect', lost);
    s.on('connect_error', lost);
    setStatus('connecting');
    setSocket(s);
    return () => {
      s.off('connect', connected);
      s.off('disconnect', lost);
      s.off('connect_error', lost);
      s.disconnect();
      setSocket(null);
    };
  }, [userId, activeRole]);

  return (
    <SocketContext.Provider value={socket}>
      <SocketStatusContext.Provider value={status}>{children}</SocketStatusContext.Provider>
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export function useSocketStatus() {
  return useContext(SocketStatusContext);
}
