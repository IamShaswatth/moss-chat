import React from 'react';

export default function StatsCard({ icon, value, label, color = 'green' }) {
    return (
        <div className="stat-card">
            <div className={`stat-card-icon ${color}`}>{icon}</div>
            <div className="stat-card-value">{value}</div>
            <div className="stat-card-label">{label}</div>
        </div>
    );
}
