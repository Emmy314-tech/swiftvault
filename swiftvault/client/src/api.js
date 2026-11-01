import axios from 'axios';

// Set VITE_API_URL to the API origin/path at build time when the API is hosted
// separately. The same-origin /api fallback works with a reverse proxy.
const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() || "/api";

const api = axios.create({
  baseURL: apiBaseUrl,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On an expired/invalid token, clear local session and send the user back to login.
// Login/register calls themselves return 400/401 for bad credentials, which should NOT
// trigger this (no token was ever set), so we only act when a token exists locally.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    if (error.response?.status === 503 && error.response?.data?.maintenanceMode) {
      window.dispatchEvent(new CustomEvent('swiftvault-maintenance-mode'));
    }
    return Promise.reject(error);
  }
);

export default api;
