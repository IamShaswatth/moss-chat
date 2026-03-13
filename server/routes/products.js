import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { injectTenant } from '../middleware/defaultTenant.js';
import { ProductCatalog } from '../models/index.js';

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// Upload CSV — parse and store products
router.post('/upload', injectTenant, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const csvContent = req.file.buffer.toString('utf-8');

        // Parse CSV — auto-detect columns
        let records;
        try {
            records = parse(csvContent, {
                columns: true,        // first row = headers
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true
            });
        } catch (parseErr) {
            return res.status(400).json({ error: 'Invalid CSV format: ' + parseErr.message });
        }

        if (records.length === 0) {
            return res.status(400).json({ error: 'CSV file is empty or has no data rows' });
        }

        // Detect column names (case-insensitive matching)
        const headers = Object.keys(records[0]);
        const findCol = (...names) => headers.find(h => names.some(n => h.toLowerCase().includes(n)));

        const nameCol = findCol('name', 'item', 'product', 'title', 'service');
        const priceCol = findCol('price', 'cost', 'rate', 'amount', 'mrp');
        const categoryCol = findCol('category', 'type', 'group', 'department');
        const descCol = findCol('description', 'desc', 'details', 'info', 'about');
        const skuCol = findCol('sku', 'code', 'id', 'barcode');
        const unitCol = findCol('unit', 'uom', 'measure');

        if (!nameCol) {
            return res.status(400).json({
                error: `Could not detect a "name/item/product" column. Found columns: ${headers.join(', ')}`
            });
        }

        // Delete existing products for this tenant from this file (replace strategy)
        const fileName = req.file.originalname;
        await ProductCatalog.deleteMany({ tenantId: req.tenantId, sourceFile: fileName });

        // Build product records
        const products = records
            .filter(row => row[nameCol]?.trim())
            .map(row => {
                const price = priceCol ? parseFloat(String(row[priceCol]).replace(/[^0-9.]/g, '')) : null;
                // Store ALL columns as extraFields for maximum flexibility
                const extraFields = {};
                headers.forEach(h => {
                    if (![nameCol, priceCol, categoryCol, descCol, skuCol, unitCol].includes(h) && row[h]?.trim()) {
                        extraFields[h] = row[h].trim();
                    }
                });

                return {
                    tenantId: req.tenantId,
                    name: row[nameCol].trim(),
                    price: isNaN(price) ? null : price,
                    category: categoryCol ? (row[categoryCol]?.trim() || null) : null,
                    description: descCol ? (row[descCol]?.trim() || null) : null,
                    sku: skuCol ? (row[skuCol]?.trim() || null) : null,
                    unit: unitCol ? (row[unitCol]?.trim() || null) : null,
                    extraFields,
                    sourceFile: fileName
                };
            });

        if (products.length === 0) {
            return res.status(400).json({ error: 'No valid product rows found in CSV' });
        }

        // Bulk insert
        await ProductCatalog.insertMany(products);

        console.log(`[Products] Imported ${products.length} items from ${fileName} for tenant ${req.tenantId}`);

        res.status(201).json({
            message: `Successfully imported ${products.length} products`,
            count: products.length,
            columns: {
                name: nameCol,
                price: priceCol || 'not detected',
                category: categoryCol || 'not detected',
                description: descCol || 'not detected'
            },
            sourceFile: fileName
        });
    } catch (error) {
        console.error('CSV upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// List all products
router.get('/', injectTenant, async (req, res) => {
    try {
        const products = await ProductCatalog.find({ tenantId: req.tenantId })
            .sort({ category: 1, name: 1 })
            .lean();
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Get catalog summary (for dashboard stats)
router.get('/summary', injectTenant, async (req, res) => {
    try {
        const total = await ProductCatalog.countDocuments({ tenantId: req.tenantId });
        const categories = await ProductCatalog.distinct('category', { tenantId: req.tenantId });
        const sourceFiles = await ProductCatalog.distinct('sourceFile', { tenantId: req.tenantId });
        const priceRange = await ProductCatalog.aggregate([
            { $match: { tenantId: req.tenantId, price: { $ne: null } } },
            { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' }, avg: { $avg: '$price' } } }
        ]);
        res.json({
            totalProducts: total,
            categories: categories.filter(Boolean),
            sourceFiles,
            priceRange: priceRange[0] || { min: 0, max: 0, avg: 0 }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

// Delete all products from a specific source file
router.delete('/file/:fileName', injectTenant, async (req, res) => {
    try {
        const result = await ProductCatalog.deleteMany({
            tenantId: req.tenantId,
            sourceFile: req.params.fileName
        });
        res.json({ message: `Deleted ${result.deletedCount} products from ${req.params.fileName}` });
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Delete single product
router.delete('/:id', injectTenant, async (req, res) => {
    try {
        const product = await ProductCatalog.findOneAndDelete({
            _id: req.params.id,
            tenantId: req.tenantId
        });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

export default router;
