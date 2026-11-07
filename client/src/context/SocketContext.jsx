import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { tokenStore } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

// One Socket.io connection per signed-in session (FE-06 chat, later FE-09 notifications). The server puts it in the
// room "user:<id>". It reconnects with the new token when the user switches role, so the server always knows the
// active role. Usage: const socket = useSocket(); socket?.on('message:new', handler) (null while signed out).
export function SocketProvider({ children }) {
  const { user, activeRole } = useAuth();
  const [socket, setSocket] = useState(null);
  const userId = user?.id;

  useEffect(() => {
    const token = tokenStore.get();
    if (!userId || !token) return undefined;
    // Same origin: Vite forwards /socket.io to the API server in development.
    const s = io({ auth: { token }, transports: ['websocket', 'polling'] });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [userId, activeRole]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
