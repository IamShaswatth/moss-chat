import { useState, useEffect } from 'react';
import api from '../api/client';

export default function Telegram() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [setupLoading, setSetupLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [pollingActive, setPollingActive] = useState(false);
    const [pollingLoading, setPollingLoading] = useState(false);

    useEffect(() => {
        fetchStatus();
        fetchPollingStatus();
    }, []);

    async function fetchStatus() {
        setLoading(true);
        try {
            const { data } = await api.get('/telegram/status');
            setStatus(data);
            if (data.webhook?.url) {
                setWebhookUrl(data.webhook.url);
            }
        } catch (err) {
            setStatus({ configured: false, error: err.message });
        }
        setLoading(false);
    }

    async function fetchPollingStatus() {
        try {
            const { data } = await api.get('/telegram/polling/status');
            setPollingActive(data.active);
        } catch (e) { }
    }

    async function setupWebhook() {
        if (!webhookUrl.trim()) {
            setMessage({ type: 'error', text: 'Please enter a webhook URL' });
            return;
        }
        setSetupLoading(true);
        setMessage(null);
        try {
            const { data } = await api.post('/telegram/setup', { webhookUrl: webhookUrl.trim() });
            if (data.ok) {
                setMessage({ type: 'success', text: 'Webhook registered successfully!' });
                fetchStatus();
            } else {
                setMessage({ type: 'error', text: data.description || 'Failed to set webhook' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || err.message });
        }
        setSetupLoading(false);
    }

    async function removeWebhook() {
        setSetupLoading(true);
        setMessage(null);
        try {
            const { data } = await api.post('/telegram/remove');
            if (data.ok) {
                setMessage({ type: 'success', text: 'Webhook removed.' });
                setWebhookUrl('');
                fetchStatus();
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message });
        }
        setSetupLoading(false);
    }

    async function togglePolling() {
        setPollingLoading(true);
        setMessage(null);
        try {
            if (pollingActive) {
                await api.post('/telegram/polling/stop');
                setPollingActive(false);
                setMessage({ type: 'success', text: 'Polling stopped.' });
            } else {
                const { data } = await api.post('/telegram/polling/start');
                setPollingActive(true);
                setMessage({ type: 'success', text: data.message || 'Polling started!' });
                fetchStatus(); // Refresh — webhook gets removed when polling starts
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || err.message });
        }
        setPollingLoading(false);
    }

    if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Loading Telegram status...</div>;

    return (
        <div style={{ maxWidth: 700 }}>
            <h2 style={{ margin: '0 0 8px 0', fontSize: 22 }}>Telegram Bot Integration</h2>
            <p style={{ color: '#888', margin: '0 0 24px 0' }}>
                Connect your Telegram bot to receive and respond to customer messages via Telegram.
            </p>

            {/* Status Card */}
            <div style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 24,
                marginBottom: 20
            }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Bot Status</h3>
                {!status?.configured ? (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                        background: '#fef3cd', borderRadius: 8, color: '#856404'
                    }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <span>{status?.error || 'Bot token not configured. Add TELEGRAM_BOT_TOKEN to your .env file.'}</span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: '#22c55e', display: 'inline-block', flexShrink: 0
                            }} />
                            <span style={{ fontWeight: 600 }}>Connected</span>
                        </div>
                        {status.bot && (
                            <div style={{
                                display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px',
                                fontSize: 14, color: '#555'
                            }}>
                                <span style={{ fontWeight: 500 }}>Bot Name:</span>
                                <span>@{status.bot.username}</span>
                                <span style={{ fontWeight: 500 }}>Display Name:</span>
                                <span>{status.bot.first_name}</span>
                                <span style={{ fontWeight: 500 }}>Bot ID:</span>
                                <span>{status.bot.id}</span>
                            </div>
                        )}
                        {status.webhook && (
                            <div style={{
                                display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px',
                                fontSize: 14, color: '#555', marginTop: 8, paddingTop: 12,
                                borderTop: '1px solid #eee'
                            }}>
                                <span style={{ fontWeight: 500 }}>Webhook URL:</span>
                                <span style={{ wordBreak: 'break-all' }}>
                                    {status.webhook.url || <em style={{ color: '#999' }}>Not set</em>}
                                </span>
                                {status.webhook.last_error_message && (
                                    <>
                                        <span style={{ fontWeight: 500, color: '#dc2626' }}>Last Error:</span>
                                        <span style={{ color: '#dc2626' }}>{status.webhook.last_error_message}</span>
                                    </>
                                )}
                                <span style={{ fontWeight: 500 }}>Pending Updates:</span>
                                <span>{status.webhook.pending_update_count || 0}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Polling Mode (Local Dev) */}
            {status?.configured && (
                <div style={{
                    background: '#fff',
                    border: pollingActive ? '2px solid #22c55e' : '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 20
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>🔄 Local Mode (Polling)</h3>
                        <span style={{
                            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            background: pollingActive ? '#dcfce7' : '#f3f4f6',
                            color: pollingActive ? '#166534' : '#6b7280'
                        }}>
                            {pollingActive ? 'ACTIVE' : 'STOPPED'}
                        </span>
                    </div>
                    <p style={{ color: '#888', margin: '0 0 16px 0', fontSize: 13 }}>
                        Works on localhost without any tunnel or public URL. Best for development and testing.
                    </p>
                    <button
                        onClick={togglePolling}
                        disabled={pollingLoading}
                        style={{
                            padding: '10px 24px',
                            background: pollingActive ? '#dc2626' : '#22c55e',
                            color: '#fff', border: 'none', borderRadius: 8,
                            cursor: 'pointer', fontWeight: 600, fontSize: 14,
                            opacity: pollingLoading ? 0.6 : 1
                        }}
                    >
                        {pollingLoading ? 'Please wait...' : pollingActive ? 'Stop Polling' : 'Start Polling'}
                    </button>
                    {pollingActive && (
                        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                            ✅ Bot is listening! Open Telegram and send a message to <strong>@{status.bot?.username}</strong>
                        </div>
                    )}
                </div>
            )}

            {/* Webhook Setup */}
            {status?.configured && (
                <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 24,
                    marginBottom: 20
                }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Webhook Configuration</h3>
                    <p style={{ color: '#888', margin: '0 0 16px 0', fontSize: 13 }}>
                        Enter your public server URL. Telegram requires HTTPS. For local development, use ngrok or cloudflare tunnel.
                    </p>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <input
                            type="text"
                            placeholder="https://yourdomain.com/api/telegram/webhook"
                            value={webhookUrl}
                            onChange={e => setWebhookUrl(e.target.value)}
                            style={{
                                flex: 1, padding: '10px 14px', border: '1px solid #ddd',
                                borderRadius: 8, fontSize: 14, outline: 'none'
                            }}
                        />
                        <button
                            onClick={setupWebhook}
                            disabled={setupLoading}
                            style={{
                                padding: '10px 20px', background: '#2563eb', color: '#fff',
                                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                                opacity: setupLoading ? 0.6 : 1, whiteSpace: 'nowrap'
                            }}
                        >
                            {setupLoading ? 'Setting...' : 'Set Webhook'}
                        </button>
                    </div>

                    {status.webhook?.url && (
                        <button
                            onClick={removeWebhook}
                            disabled={setupLoading}
                            style={{
                                padding: '8px 16px', background: '#fff', color: '#dc2626',
                                border: '1px solid #dc2626', borderRadius: 8, cursor: 'pointer',
                                fontSize: 13, opacity: setupLoading ? 0.6 : 1
                            }}
                        >
                            Remove Webhook
                        </button>
                    )}

                    {message && (
                        <div style={{
                            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 14,
                            background: message.type === 'success' ? '#dcfce7' : '#fef2f2',
                            color: message.type === 'success' ? '#166534' : '#991b1b'
                        }}>
                            {message.text}
                        </div>
                    )}
                </div>
            )}

            {/* Setup Guide */}
            <div style={{
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 24
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 16 }}>📋 Setup Guide</h3>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: '#555' }}>
                    <li><strong>Bot Token</strong> — Already configured ✓</li>
                    <li>
                        <strong>Public URL</strong> — Expose your server to the internet:
                        <ul style={{ lineHeight: 1.8, margin: '4px 0' }}>
                            <li>Option A: Deploy to a server with HTTPS</li>
                            <li>Option B: Use <code>ngrok http 3000</code> for local testing</li>
                        </ul>
                    </li>
                    <li><strong>Set Webhook</strong> — Paste the public URL + <code>/api/telegram/webhook</code> above</li>
                    <li><strong>Test</strong> — Send a message to your bot on Telegram!</li>
                </ol>

                <div style={{
                    marginTop: 16, padding: 12, background: '#eef2ff', borderRadius: 8,
                    fontSize: 13, color: '#4338ca'
                }}>
                    <strong>Quick start (ngrok):</strong><br />
                    <code style={{ fontSize: 12 }}>npx ngrok http 3000</code><br />
                    Copy the HTTPS URL and add <code>/api/telegram/webhook</code> to it.
                </div>
            </div>
        </div>
    );
}
