import axios from 'axios';
const api = axios.create({
  baseURL: 'https://esat-backend-drwm.onrender.com/api',
  headers: { 'Content-Type': 'application/json' },
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('esat_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('esat_token');
      localStorage.removeItem('esat_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
export default api;
