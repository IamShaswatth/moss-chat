import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [token, setToken] = useState(localStorage.getItem('moss_token'));
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('moss_user');
        return saved ? JSON.parse(saved) : null;
    });

    const login = (tokenData, userData) => {
        localStorage.setItem('moss_token', tokenData);
        localStorage.setItem('moss_user', JSON.stringify(userData));
        setToken(tokenData);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('moss_token');
        localStorage.removeItem('moss_user');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ token, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
