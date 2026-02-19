import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';

export default function Login() {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = isRegister ? '/auth/register' : '/auth/login';
            const { data } = await api.post(endpoint, { email, password });
            login(data.token, data.user);
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card fade-in">
                <h1>🌿 Moss Chat</h1>
                <p>{isRegister ? 'Create your account' : 'Sign in to your dashboard'}</p>

                {error && <div className="error-msg">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@company.com"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                            required
                            minLength={6}
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? <span className="spinner" /> : (isRegister ? 'Create Account' : 'Sign In')}
                    </button>
                </form>

                <div className="login-toggle">
                    {isRegister ? 'Already have an account? ' : "Don't have an account? "}
                    <button onClick={() => { setIsRegister(!isRegister); setError(''); }}>
                        {isRegister ? 'Sign In' : 'Register'}
                    </button>
                </div>
            </div>
        </div>
    );
}
