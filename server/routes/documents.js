import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { Document } from '../models/index.js';
import { extractText } from '../services/pdf.js';
import { chunkText } from '../services/rag/chunker.js';
import { generateEmbeddings } from '../services/rag/embeddings.js';
import { upsertVectors, deleteByDocument } from '../services/rag/pinecone.js';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Upload and ingest PDF
router.post('/upload', authenticate, enforceTenant, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Create document record
        const doc = await createDocument({
            filename: `${Date.now()}-${req.file.originalname}`,
            originalName: req.file.originalname,
            tenantId: req.tenantId,
            fileSize: req.file.size,
            status: 'processing'
        });

        const docId = doc.id || doc._id;

        // Process async (don't block response)
        processDocument(req.file.buffer, docId, req.tenantId).catch(err => {
            console.error('Document processing failed:', err);
        });

        res.status(201).json({
            id: docId,
            filename: doc.originalName,
            status: 'processing',
            message: 'Document uploaded and processing started'
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// List documents
router.get('/', authenticate, enforceTenant, async (req, res) => {
    try {
        const docs = await findDocuments(req.tenantId);
        res.json(docs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Delete document
router.delete('/:id', authenticate, enforceTenant, async (req, res) => {
    try {
        const doc = await findDocumentById(req.params.id, req.tenantId);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        const docId = doc.id || doc._id;
        await deleteByDocument(docId.toString(), req.tenantId);
        await deleteDocument(docId);

        res.json({ message: 'Document deleted' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Process document pipeline
async function processDocument(buffer, docId, tenantId) {
    try {
        // 1. Extract text
        const text = await extractText(buffer);
        if (!text || text.trim().length < 50) {
            await updateDocumentStatus(docId, 'failed');
            return;
        }

        // 2. Chunk text
        const chunks = chunkText(text);
        if (chunks.length === 0) {
            await updateDocumentStatus(docId, 'failed');
            return;
        }

        // 3. Generate embeddings
        const embeddings = await generateEmbeddings(chunks.map(c => c.text));

        // 4. Upsert to Pinecone
        const vectors = chunks.map((chunk, i) => ({
            id: `${docId}-chunk-${i}`,
            values: embeddings[i],
            metadata: {
                text: chunk.text,
                documentId: docId.toString(),
                chunkIndex: chunk.index,
                tenantId
            }
        }));

        await upsertVectors(vectors, tenantId);

        // 5. Update document status
        await updateDocumentStatus(docId, 'ready', chunks.length);
        console.log(`✅ Document ${docId} processed: ${chunks.length} chunks`);
    } catch (error) {
        console.error(`❌ Document ${docId} processing failed:`, error);
        await updateDocumentStatus(docId, 'failed');
    }
}

// DB-agnostic helpers
async function createDocument(data) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return Document.create(data);
    }
    return new Document(data).save();
}

async function findDocuments(tenantId) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return Document.findAll({ where: { tenantId }, order: [['createdAt', 'DESC']] });
    }
    return Document.find({ tenantId }).sort({ createdAt: -1 });
}

async function findDocumentById(id, tenantId) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return Document.findOne({ where: { id, tenantId } });
    }
    return Document.findOne({ _id: id, tenantId });
}

async function updateDocumentStatus(id, status, chunkCount) {
    const update = { status };
    if (chunkCount !== undefined) update.chunkCount = chunkCount;

    if (process.env.DATABASE_TYPE === 'postgresql') {
        return Document.update(update, { where: { id } });
    }
    return Document.updateOne({ _id: id }, update);
}

async function deleteDocument(id) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return Document.destroy({ where: { id } });
    }
    return Document.deleteOne({ _id: id });
}

export default router;
