import React, { useState, useEffect } from 'react';
import api from '../api/client.js';

export default function Suggestions() {
    const [suggestions, setSuggestions] = useState([]);
    const [faqSuggestions, setFaqSuggestions] = useState([]);
    const [faqs, setFaqs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState('queries');

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        try {
            const [sugRes, faqRes] = await Promise.all([
                api.get('/analytics/suggestions'),
                api.get('/analytics/faqs')
            ]);
            setSuggestions(sugRes.data);
            setFaqs(faqRes.data);
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = async (id) => {
        if (!confirm('Dismiss this suggestion?')) return;
        try {
            await api.delete(`/analytics/suggestions/${id}`);
            setSuggestions(suggestions.filter(s => s._id !== id));
        } catch (err) {
            alert('Failed to dismiss');
        }
    };

    const handleGenerateFaqs = async () => {
        setGenerating(true);
        try {
            const { data } = await api.post('/analytics/generate-faqs');
            setFaqSuggestions(data.suggestions || []);
            if (data.suggestions?.length > 0) {
                setActiveTab('ai');
            } else {
                alert(data.message || 'No suggestions generated.');
            }
        } catch (err) {
            alert('Failed to generate FAQ suggestions');
        } finally {
            setGenerating(false);
        }
    };

    const handleApprove = async (suggestion, faqQuestion) => {
        // Find the original UnansweredQuestion that matches
        const match = suggestions.find(s =>
            s.question.toLowerCase().includes(suggestion.originalQuery?.toLowerCase()) ||
            suggestion.originalQuery?.toLowerCase().includes(s.question.toLowerCase())
        );

        if (!match) {
            alert('Could not match suggestion to original query. Approving with new FAQ entry.');
        }

        try {
            if (match) {
                await api.post(`/analytics/suggestions/${match._id}/approve`, {
                    faqQuestion: faqQuestion || suggestion.suggestedQuestion
                });
                setSuggestions(suggestions.filter(s => s._id !== match._id));
            }
            setFaqSuggestions(faqSuggestions.filter(s => s !== suggestion));
            // Refresh FAQs
            const { data } = await api.get('/analytics/faqs');
            setFaqs(data);
        } catch (err) {
            alert('Failed to approve suggestion');
        }
    };

    const handleDeleteFaq = async (id) => {
        if (!confirm('Remove this FAQ entry?')) return;
        try {
            await api.delete(`/analytics/faqs/${id}`);
            setFaqs(faqs.filter(f => f._id !== id));
        } catch (err) {
            alert('Failed to delete FAQ');
        }
    };

    const formatScore = (score) => {
        if (score >= 0.4) return <span className="badge ready">High</span>;
        if (score >= 0.3) return <span className="badge processing">Medium</span>;
        return <span className="badge failed" style={{ background: 'var(--text-muted)', color: '#fff' }}>Low</span>;
    };

    const tabStyle = (tab) => ({
        padding: '10px 20px',
        cursor: 'pointer',
        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
        color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: activeTab === tab ? 600 : 400,
        background: 'none',
        border: 'none',
        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
        fontSize: '0.9rem'
    });

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
                <span className="spinner" />
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1>Knowledge Suggestions</h1>
                    <p>AI-powered FAQ expansion from user queries</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleGenerateFaqs}
                    disabled={generating || suggestions.length === 0}
                    style={{ whiteSpace: 'nowrap' }}
                >
                    {generating ? '⏳ Analyzing...' : '🧠 Generate FAQ Suggestions'}
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
                <button style={tabStyle('queries')} onClick={() => setActiveTab('queries')}>
                    📋 Unanswered Queries ({suggestions.length})
                </button>
                <button style={tabStyle('ai')} onClick={() => setActiveTab('ai')}>
                    🧠 AI Suggestions ({faqSuggestions.length})
                </button>
                <button style={tabStyle('faqs')} onClick={() => setActiveTab('faqs')}>
                    ✅ Approved FAQs ({faqs.length})
                </button>
            </div>

            {/* Tab: Unanswered Queries */}
            {activeTab === 'queries' && (
                suggestions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">✨</div>
                        <div className="empty-state-text">No unanswered queries yet</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Queries will appear here when users ask questions not covered by your knowledge base
                        </p>
                    </div>
                ) : (
                    <div className="data-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Question</th>
                                    <th>Relevance</th>
                                    <th>Times Asked</th>
                                    <th>Last Asked</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {suggestions.map((item) => (
                                    <tr key={item._id}>
                                        <td style={{ fontWeight: 500 }}>{item.question}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                {formatScore(item.score)}
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    ({Math.round(item.score * 100)}%)
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>{item.count}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>
                                            {new Date(item.lastAskedAt).toLocaleDateString()}
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-sm"
                                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                                onClick={() => handleDismiss(item._id)}
                                            >
                                                Dismiss
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {/* Tab: AI-Generated Suggestions */}
            {activeTab === 'ai' && (
                faqSuggestions.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🧠</div>
                        <div className="empty-state-text">No AI suggestions yet</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Click "Generate FAQ Suggestions" to analyze frequent queries
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '16px' }}>
                        {faqSuggestions.map((s, i) => (
                            <div key={i} className="card" style={{
                                padding: '20px',
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                                background: 'var(--bg-card)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '8px' }}>
                                            📌 {s.suggestedQuestion}
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '4px' }}>
                                            <strong>Why:</strong> {s.reason}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            Asked ~{s.frequency} times | Original: "{s.originalQuery}"
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={() => handleApprove(s)}
                                        >
                                            ✅ Approve
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                            onClick={() => setFaqSuggestions(faqSuggestions.filter((_, j) => j !== i))}
                                        >
                                            Skip
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Tab: Approved FAQs */}
            {activeTab === 'faqs' && (
                faqs.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📚</div>
                        <div className="empty-state-text">No approved FAQs</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Approved FAQ entries will be injected into your chatbot's context
                        </p>
                    </div>
                ) : (
                    <div className="data-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>FAQ Question</th>
                                    <th>Created</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {faqs.map((faq) => (
                                    <tr key={faq._id}>
                                        <td style={{ fontWeight: 500 }}>{faq.question}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>
                                            {new Date(faq.createdAt).toLocaleDateString()}
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-sm"
                                                style={{ background: '#fee2e2', color: '#dc2626' }}
                                                onClick={() => handleDeleteFaq(faq._id)}
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    );
}
