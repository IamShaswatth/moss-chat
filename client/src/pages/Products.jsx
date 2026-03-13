import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client.js';

export default function Products() {
    const [products, setProducts] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchProducts();
        fetchSummary();
    }, []);

    const fetchProducts = async () => {
        try {
            const { data } = await api.get('/products');
            setProducts(data);
        } catch (err) {
            console.error('Failed to fetch products:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const { data } = await api.get('/products/summary');
            setSummary(data);
        } catch (err) {
            console.error('Failed to fetch summary:', err);
        }
    };

    const handleUpload = async (file) => {
        if (!file) return;
        setUploading(true);
        setError('');
        setSuccess('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const { data } = await api.post('/products/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setSuccess(`${data.message} (Detected columns: ${Object.entries(data.columns).map(([k, v]) => `${k}=${v}`).join(', ')})`);
            fetchProducts();
            fetchSummary();
        } catch (err) {
            setError(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDeleteFile = async (fileName) => {
        if (!confirm(`Delete all products from "${fileName}"?`)) return;
        try {
            await api.delete(`/products/file/${encodeURIComponent(fileName)}`);
            setSuccess(`Deleted products from ${fileName}`);
            fetchProducts();
            fetchSummary();
        } catch (err) {
            setError('Delete failed');
        }
    };

    const handleDeleteProduct = async (id) => {
        try {
            await api.delete(`/products/${id}`);
            setProducts(products.filter(p => (p._id || p.id) !== id));
            fetchSummary();
        } catch (err) {
            setError('Delete failed');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
            handleUpload(file);
        } else {
            setError('Only CSV files are allowed');
        }
    };

    // Filtering
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    const sourceFiles = [...new Set(products.map(p => p.sourceFile).filter(Boolean))];

    const filtered = products.filter(p => {
        const matchSearch = !searchTerm ||
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.sku || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchCategory = !filterCategory || p.category === filterCategory;
        return matchSearch && matchCategory;
    });

    const formatPrice = (price) => {
        if (price == null) return '—';
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h1>Product Catalog</h1>
                <p>Upload CSV files with items and prices for sales queries</p>
            </div>

            {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}
            {success && <div style={{ background: 'var(--success)', color: '#fff', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>{success}</div>}

            {/* Summary Cards */}
            {summary && (
                <div className="stats-grid" style={{ marginBottom: 24 }}>
                    <div className="stat-card">
                        <div className="stat-label">Total Products</div>
                        <div className="stat-value">{summary.totalProducts}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Categories</div>
                        <div className="stat-value">{summary.categories?.length || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">CSV Files</div>
                        <div className="stat-value">{summary.sourceFiles?.length || 0}</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-label">Price Range</div>
                        <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                            {summary.priceRange?.min != null && summary.priceRange?.max != null
                                ? `${formatPrice(summary.priceRange.min)} - ${formatPrice(summary.priceRange.max)}`
                                : '—'}
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Zone */}
            <div
                className="upload-zone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
            >
                {uploading ? (
                    <>
                        <div className="upload-zone-icon"><span className="spinner" /></div>
                        <div className="upload-zone-text">Uploading and parsing CSV...</div>
                    </>
                ) : (
                    <>
                        <div className="upload-zone-icon">📊</div>
                        <div className="upload-zone-text">
                            <strong>Click to upload</strong> or drag and drop a CSV file
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 4 }}>
                            CSV should have columns like: name/item, price, category, description
                        </div>
                    </>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => handleUpload(e.target.files[0])}
            />

            {/* Source Files List */}
            {sourceFiles.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Uploaded Files:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {sourceFiles.map(file => {
                            const count = products.filter(p => p.sourceFile === file).length;
                            return (
                                <div key={file} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    background: 'var(--bg-secondary)', padding: '6px 12px',
                                    borderRadius: 6, fontSize: '0.8rem'
                                }}>
                                    <span>📄 {file} ({count} items)</span>
                                    <button
                                        onClick={() => handleDeleteFile(file)}
                                        style={{
                                            background: 'none', border: 'none', color: 'var(--danger)',
                                            cursor: 'pointer', padding: '2px 4px', fontSize: '0.75rem'
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Filters */}
            {products.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <input
                        type="text"
                        placeholder="Search products..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            flex: 1, padding: '8px 12px', borderRadius: 6,
                            border: '1px solid var(--border)', background: 'var(--bg-primary)',
                            color: 'var(--text-primary)', fontSize: '0.85rem'
                        }}
                    />
                    {categories.length > 0 && (
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            style={{
                                padding: '8px 12px', borderRadius: 6,
                                border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem'
                            }}
                        >
                            <option value="">All Categories</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    )}
                </div>
            )}

            {/* Products Table */}
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                    <span className="spinner" />
                </div>
            ) : products.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <div className="empty-state-text">No products yet</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Upload a CSV file with your product catalog (items, prices, categories)
                    </p>
                </div>
            ) : (
                <>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                        Showing {filtered.length} of {products.length} products
                    </div>
                    <div className="data-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Price</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th>SKU</th>
                                    <th>Source</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((product) => {
                                    const id = product._id || product.id;
                                    return (
                                        <tr key={id}>
                                            <td style={{ fontWeight: 500 }}>{product.name}</td>
                                            <td>{formatPrice(product.price)}</td>
                                            <td>
                                                {product.category && (
                                                    <span className="badge ready">{product.category}</span>
                                                )}
                                            </td>
                                            <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
                                                {product.description || '—'}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                {product.sku || '—'}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                {product.sourceFile || '—'}
                                            </td>
                                            <td>
                                                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteProduct(id)}>
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
