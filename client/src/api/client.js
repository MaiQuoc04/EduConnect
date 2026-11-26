import axios from 'axios';

const TOKEN_KEY = 'educonnect.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// All API calls go through this instance: it adds the token and normalises errors to { code, message }.
// VITE_API_URL (set at build time on Vercel) points to the API on its own domain; unset in development, so '/api/v1'
// goes through the Vite proxy.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api/v1' });

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data ?? {};
    if (err.response?.status === 401 && data.code === 'AUTH_INVALID') tokenStore.clear();
    // A request given a `timeout` (chat, FE-06) that got no answer in time: the server may still have done it.
    const timedOut = !err.response && (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT');
    return Promise.reject({
      status: err.response?.status ?? 0,
      code: data.code ?? (timedOut ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR'),
      message: data.message ?? 'Cannot reach the server. Please try again.',
      details: data.details,
    });
  },
);
