import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);
const SIGNED_OUT = { loading: false, user: null, roles: [], activeRole: null };

// Holds the signed-in user, their roles and the role they are acting as (ERD 1b).
export function AuthProvider({ children }) {
  const [state, setState] = useState({ ...SIGNED_OUT, loading: true });

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) return setState(SIGNED_OUT);
    try {
      const { data } = await api.get('/auth/me');
      setState({ loading: false, ...data });
    } catch {
      tokenStore.clear();
      setState(SIGNED_OUT);
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

  // UC-05: after a password change the server issues a token without the "temporary password" flag.
  function passwordChanged(token) {
    tokenStore.set(token);
    setState((s) => ({ ...s, user: { ...s.user, mustChangePassword: false } }));
  }

  function updateUser(changes) {
    setState((s) => ({ ...s, user: { ...s.user, ...changes } }));
  }

  // UC-03 Sign Out: the JWT is stateless, dropping it ends the session.
  function signOut() {
    tokenStore.clear();
    setState(SIGNED_OUT);
  }

  return (
    <AuthContext.Provider value={{ ...state, signIn, switchRole, passwordChanged, updateUser, refresh: loadMe, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
