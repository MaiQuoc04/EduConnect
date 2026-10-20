import axios from 'axios';

const TOKEN_KEY = 'educonnect.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// All API calls go through this instance: it adds the token and normalises errors to { code, message }.
export const api = axios.create({ baseURL: '/api/v1' });

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
    return Promise.reject({
      status: err.response?.status ?? 0,
      code: data.code ?? 'NETWORK_ERROR',
      message: data.message ?? 'Cannot reach the server. Please try again.',
      details: data.details,
    });
  },
);
