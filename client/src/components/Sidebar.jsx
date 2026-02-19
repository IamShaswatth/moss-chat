import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Sidebar() {
    const { logout, user } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <span>🌿</span> Moss Chat
            </div>
            <div className="sidebar-subtitle">Admin Panel</div>

            <nav className="sidebar-nav">
                <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="9" rx="1" />
                        <rect x="14" y="3" width="7" height="5" rx="1" />
                        <rect x="14" y="12" width="7" height="9" rx="1" />
                        <rect x="3" y="16" width="7" height="5" rx="1" />
                    </svg>
                    Dashboard
                </NavLink>

                <NavLink to="/documents" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Documents
                </NavLink>

                <NavLink to="/chat-history" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    Chat History
                </NavLink>
            </nav>

            <div className="sidebar-footer">
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', padding: '0 4px' }}>
                    {user?.email}
                </div>
                <button onClick={logout}>Sign Out</button>
            </div>
        </aside>
    );
}
