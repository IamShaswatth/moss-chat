import React, { useState, useEffect } from 'react';
import api from '../api/client.js';
import StatsCard from '../components/StatsCard.jsx';

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const { data } = await api.get('/analytics');
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
                <span className="spinner" />
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>Dashboard</h1>
                <p>Overview of your Moss Chat instance</p>
            </div>

            <div className="stats-grid">
                <StatsCard
                    icon="📄"
                    value={stats?.totalDocuments || 0}
                    label="Total Documents"
                    color="purple"
                    sub={`${stats?.recentDocuments?.length || 0} recent`}
                />
                <StatsCard
                    icon="💬"
                    value={stats?.totalChats || 0}
                    label="Total Chats"
                    color="blue"
                />
                <StatsCard
                    icon="📊"
                    value={stats?.recentDocuments?.length || 0}
                    label="Recent Uploads"
                    color="green"
                />
            </div>

            {stats?.recentDocuments && stats.recentDocuments.length > 0 && (
                <div>
                    <div className="section-header">
                        <h2 className="section-title">Recent Documents</h2>
                    </div>
                    <div className="data-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Status</th>
                                    <th>Chunks</th>
                                    <th>Uploaded</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.recentDocuments.map((doc) => (
                                    <tr key={doc.id || doc._id}>
                                        <td style={{ fontWeight: 500 }}>{doc.originalName || doc.filename}</td>
                                        <td>
                                            <span className={`badge ${doc.status}`}>
                                                {doc.status}
                                            </span>
                                        </td>
                                        <td>{doc.chunkCount || 0}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{new Date(doc.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
