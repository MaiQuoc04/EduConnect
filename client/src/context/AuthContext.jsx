import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

// Holds the signed-in user, their roles and the role they are acting as (ERD 1b).
export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, roles: [], activeRole: null });

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) return setState({ loading: false, user: null, roles: [], activeRole: null });
    try {
      const { data } = await api.get('/auth/me');
      setState({ loading: false, ...data });
    } catch {
      tokenStore.clear();
      setState({ loading: false, user: null, roles: [], activeRole: null });
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  async function signIn(identifier, password) {
    const { data } = await api.post('/auth/sign-in', { identifier, password });
    tokenStore.set(data.token);
    setState({ loading: false, user: data.user, roles: data.roles, activeRole: data.activeRole });
    return data;
  }

  async function switchRole(role) {
    const { data } = await api.post('/auth/switch-role', { role });
    tokenStore.set(data.token);
    setState((s) => ({ ...s, roles: data.roles, activeRole: data.activeRole }));
  }

  function signOut() {
    tokenStore.clear();
    setState({ loading: false, user: null, roles: [], activeRole: null });
  }

  return <AuthContext.Provider value={{ ...state, signIn, switchRole, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
