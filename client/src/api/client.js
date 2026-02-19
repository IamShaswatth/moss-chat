import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' }
});

// Auto-attach JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('moss_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401
api.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('moss_token');
            localStorage.removeItem('moss_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
