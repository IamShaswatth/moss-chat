import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' }
});

// Handle errors
api.interceptors.response.use(
    (res) => res,
    (error) => {
        return Promise.reject(error);
    }
);

export default api;
