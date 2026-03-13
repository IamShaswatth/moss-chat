import React, { createContext, useContext } from 'react';

const AuthContext = createContext(null);

// Single-tenant mode: no login required
const DEFAULT_USER = {
    email: 'admin',
    tenantId: '94aece93-be80-4cf4-b13c-a464751394d9',
    role: 'admin'
};

export function AuthProvider({ children }) {
    return (
        <AuthContext.Provider value={{ user: DEFAULT_USER, token: 'no-auth', login: () => {}, logout: () => {} }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
