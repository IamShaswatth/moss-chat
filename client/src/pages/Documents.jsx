import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client.js';

export default function Documents() {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const { data } = await api.get('/documents');
            setDocuments(data);
        } catch (err) {
            console.error('Failed to fetch documents:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (file) => {
        if (!file) return;
        setUploading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            await api.post('/documents/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setTimeout(fetchDocuments, 1000);
        } catch (err) {
            setError(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this document?')) return;

        try {
            await api.delete(`/documents/${id}`);
            setDocuments(documents.filter(d => (d.id || d._id) !== id));
        } catch (err) {
            setError('Delete failed');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            handleUpload(file);
        } else {
            setError('Only PDF files are allowed');
        }
    };

    const formatSize = (bytes) => {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>Documents</h1>
                <p>Upload and manage your knowledge base documents</p>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <div
                className="upload-zone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
            >
                {uploading ? (
                    <>
                        <div className="upload-zone-icon"><span className="spinner" /></div>
                        <div className="upload-zone-text">Uploading and processing...</div>
                    </>
                ) : (
                    <>
                        <div className="upload-zone-icon">📄</div>
                        <div className="upload-zone-text">
                            <strong>Click to upload</strong> or drag and drop a PDF file
                        </div>
                    </>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => handleUpload(e.target.files[0])}
            />

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                    <span className="spinner" />
                </div>
            ) : documents.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📂</div>
                    <div className="empty-state-text">No documents yet</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Upload a PDF to build your knowledge base
                    </p>
                </div>
            ) : (
                <div className="data-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Filename</th>
                                <th>Status</th>
                                <th>Chunks</th>
                                <th>Size</th>
                                <th>Uploaded</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((doc) => {
                                const id = doc.id || doc._id;
                                return (
                                    <tr key={id}>
                                        <td style={{ fontWeight: 500 }}>{doc.originalName || doc.filename}</td>
                                        <td>
                                            <span className={`badge ${doc.status}`}>
                                                {doc.status === 'processing' && <span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />}
                                                {doc.status}
                                            </span>
                                        </td>
                                        <td>{doc.chunkCount || 0}</td>
                                        <td>{formatSize(doc.fileSize)}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{new Date(doc.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(id)}>
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
