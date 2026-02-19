import React from 'react';

export default function StatsCard({ icon, value, label, color = 'purple', sub }) {
    return (
        <div className="stat-card">
            <div className="stat-card-header">
                <div className="stat-card-label">{label}</div>
                <div className={`stat-card-icon ${color}`}>{icon}</div>
            </div>
            <div className="stat-card-value">{value}</div>
            {sub && <div className="stat-card-sub">{sub}</div>}
        </div>
    );
}
