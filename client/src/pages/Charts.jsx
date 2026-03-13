import React, { useState, useEffect } from 'react';
import api from '../api/client.js';

// Pure CSS horizontal bar chart
function BarChart({ data, labelKey, valueKey, maxValue, color = 'var(--accent)', emptyText = 'No data' }) {
    if (!data || data.length === 0) {
        return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '24px 0', textAlign: 'center' }}>{emptyText}</div>;
    }
    const max = maxValue || Math.max(...data.map(d => d[valueKey]));
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 150, minWidth: 150, fontSize: '0.8rem', color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        textAlign: 'right'
                    }} title={item[labelKey]}>
                        {item[labelKey]}
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 4, height: 24, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                            width: `${max > 0 ? (item[valueKey] / max * 100) : 0}%`,
                            height: '100%', background: color, borderRadius: 4,
                            transition: 'width 0.6s ease', minWidth: item[valueKey] > 0 ? 4 : 0
                        }} />
                    </div>
                    <div style={{ width: 40, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {item[valueKey]}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Mini sparkline-style bar chart for chat volume
function VolumeChart({ data }) {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data.map(d => d.count), 1);
    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100, padding: '0 4px' }}>
            {data.map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                        width: '100%', maxWidth: 20,
                        height: `${max > 0 ? (d.count / max * 80) : 0}px`,
                        minHeight: d.count > 0 ? 3 : 1,
                        background: d.count > 0 ? 'var(--accent)' : 'var(--border)',
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.4s ease',
                        opacity: d.count > 0 ? 1 : 0.3
                    }} title={`${d.date}: ${d.count} chats`} />
                </div>
            ))}
        </div>
    );
}

// Donut-style stat ring (pure CSS)
function StatRing({ value, max, label, color }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 8px',
                background: `conic-gradient(${color} ${pct * 3.6}deg, var(--bg-secondary) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)'
                }}>
                    {value}
                </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{label}</div>
        </div>
    );
}

export default function Charts() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('questions');

    useEffect(() => {
        fetchChartData();
    }, []);

    const fetchChartData = async () => {
        try {
            const { data } = await api.get('/analytics/charts');
            setData(data);
        } catch (err) {
            console.error('Failed to fetch chart data:', err);
        } finally {
            setLoading(false);
        }
    };

    const tabStyle = (tab) => ({
        padding: '10px 20px',
        cursor: 'pointer',
        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
        color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: activeTab === tab ? 600 : 400,
        background: 'none',
        border: 'none',
        fontSize: '0.9rem'
    });

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
                <span className="spinner" />
            </div>
        );
    }

    if (!data) {
        return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Failed to load analytics data.</div>;
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>Analytics Charts</h1>
                <p>Visual insights into customer queries and product interest</p>
            </div>

            {/* Overview Stats */}
            <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                    <div className="stat-label">Total Questions Tracked</div>
                    <div className="stat-value">{data.totalQuestions}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Chat Sessions</div>
                    <div className="stat-value">{data.totalSessions}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Products in Catalog</div>
                    <div className="stat-value">{data.totalProducts}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Avg. Confidence</div>
                    <div className="stat-value">{data.avgConfidence}%</div>
                </div>
            </div>

            {/* Question Status Rings */}
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Question Status Overview</h3>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 48 }}>
                    <StatRing value={data.questionStatus.pending} max={data.totalQuestions} label="Pending" color="#f59e0b" />
                    <StatRing value={data.questionStatus.converted} max={data.totalQuestions} label="Converted to FAQ" color="var(--success)" />
                    <StatRing value={data.questionStatus.dismissed} max={data.totalQuestions} label="Dismissed" color="var(--text-muted)" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--success)' }} />
                        High relevance ({data.scoreBuckets.high})
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#f59e0b' }} />
                        Medium ({data.scoreBuckets.medium})
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--text-muted)' }} />
                        Low ({data.scoreBuckets.low})
                    </div>
                </div>
            </div>

            {/* Chat Volume */}
            <div className="card" style={{ padding: 24, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Chat Volume (Last 30 Days)</h3>
                <p style={{ margin: '0 0 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {data.chatVolume.reduce((s, d) => s + d.count, 0)} total conversations
                </p>
                <VolumeChart data={data.chatVolume} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    <span>{data.chatVolume[0]?.date}</span>
                    <span>{data.chatVolume[data.chatVolume.length - 1]?.date}</span>
                </div>
            </div>

            {/* Tabs: Questions vs Products */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
                <button style={tabStyle('questions')} onClick={() => setActiveTab('questions')}>
                    Frequently Asked Questions ({data.topQuestions.length})
                </button>
                <button style={tabStyle('products')} onClick={() => setActiveTab('products')}>
                    Most Asked Products ({data.topProducts.length})
                </button>
                <button style={tabStyle('categories')} onClick={() => setActiveTab('categories')}>
                    Popular Categories ({data.topCategories.length})
                </button>
            </div>

            {activeTab === 'questions' && (
                <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Top Frequently Asked Questions</h3>
                    {data.topQuestions.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">❓</div>
                            <div className="empty-state-text">No tracked questions yet</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Questions will appear here as users ask them</p>
                        </div>
                    ) : (
                        <>
                            <BarChart
                                data={data.topQuestions}
                                labelKey="question"
                                valueKey="count"
                                color="var(--accent)"
                            />
                            <div style={{ marginTop: 24 }}>
                                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>Details</h4>
                                <div className="data-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Question</th>
                                                <th>Times Asked</th>
                                                <th>Relevance</th>
                                                <th>Status</th>
                                                <th>Last Asked</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.topQuestions.map((q, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {q.question}
                                                    </td>
                                                    <td>{q.count}</td>
                                                    <td>
                                                        <span className={`badge ${q.score >= 0.4 ? 'ready' : q.score >= 0.25 ? 'processing' : 'failed'}`}>
                                                            {Math.round(q.score * 100)}%
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${q.status === 'converted' ? 'ready' : q.status === 'pending' ? 'processing' : 'failed'}`}>
                                                            {q.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                        {q.lastAskedAt ? new Date(q.lastAskedAt).toLocaleDateString() : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === 'products' && (
                <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Most Enquired Products</h3>
                    {data.topProducts.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📊</div>
                            <div className="empty-state-text">No product mentions detected</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Upload a product CSV and start chatting to see which products are popular
                            </p>
                        </div>
                    ) : (
                        <BarChart
                            data={data.topProducts}
                            labelKey="name"
                            valueKey="count"
                            color="#10b981"
                        />
                    )}
                </div>
            )}

            {activeTab === 'categories' && (
                <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Popular Product Categories</h3>
                    {data.topCategories.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🏷️</div>
                            <div className="empty-state-text">No category data yet</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Categories from your product CSV will appear here based on user queries
                            </p>
                        </div>
                    ) : (
                        <BarChart
                            data={data.topCategories}
                            labelKey="category"
                            valueKey="count"
                            color="#8b5cf6"
                        />
                    )}
                </div>
            )}
        </div>
    );
}
