import axios from 'axios';

const client = axios.create({ baseURL: '/api' });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Redirect to POS login if currently on a POS path, otherwise admin login
      const isPosPath = window.location.pathname.startsWith('/pos');
      window.location.href = isPosPath ? '/pos-login' : '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
