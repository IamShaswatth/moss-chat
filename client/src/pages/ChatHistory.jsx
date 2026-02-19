import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';

export default function ChatHistory() {
    const [sessions, setSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const { data } = await api.get(`/chat/sessions?tenantId=${user.tenantId}`);
            setSessions(data);
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        } finally {
            setLoading(false);
        }
    };

    const viewSession = async (sessionId) => {
        try {
            const { data } = await api.get(`/chat/sessions/${sessionId}`);
            setSelectedSession(data);
        } catch (err) {
            console.error('Failed to fetch session:', err);
        }
    };

    const formatTime = (date) => {
        const d = new Date(date);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
                <h1>Chat History</h1>
                <p>View past conversations from your chat widget</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: selectedSession ? '1fr 1fr' : '1fr', gap: '24px' }}>
                {/* Session List */}
                <div>
                    {sessions.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">💬</div>
                            <div className="empty-state-text">No conversations yet</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Conversations will appear here when users interact with your chat widget
                            </p>
                        </div>
                    ) : (
                        <div className="session-list">
                            {sessions.map((session) => {
                                const id = session.id || session._id;
                                return (
                                    <div
                                        key={id}
                                        className="session-card"
                                        onClick={() => viewSession(id)}
                                        style={{
                                            borderColor: selectedSession && (selectedSession.id || selectedSession._id) === id
                                                ? 'var(--accent)' : undefined
                                        }}
                                    >
                                        <div className="session-card-header">
                                            <span className="session-card-id">
                                                Visitor: {session.visitorId?.substring(0, 8) || 'anonymous'}...
                                            </span>
                                            <span className="session-card-time">
                                                {formatTime(session.createdAt)}
                                            </span>
                                        </div>
                                        <div className="session-card-preview">
                                            {session.messages?.[0]?.content?.substring(0, 80) || 'No messages'}
                                            {session.messages?.length > 0 && ` (${session.messages.length} messages)`}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Message Detail */}
                {selectedSession && (
                    <div className="messages-panel">
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Conversation</h3>
                            <button
                                className="btn btn-sm"
                                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                onClick={() => setSelectedSession(null)}
                            >
                                Close
                            </button>
                        </div>

                        {(selectedSession.messages || []).map((msg, i) => (
                            <div key={i} className={`message ${msg.role}`}>
                                <div className="message-bubble">
                                    {msg.content}
                                </div>
                                <div className="message-meta">
                                    <span>{msg.role}</span>
                                    {msg.confidence && (
                                        <span>Confidence: {Math.round(msg.confidence * 100)}%</span>
                                    )}
                                </div>
                                {msg.citations && msg.citations.length > 0 && (
                                    <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {msg.citations.map((c, j) => (
                                            <span key={j} style={{ marginRight: '8px' }}>
                                                [Source {c.index}] Score: {c.score}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
