import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    role: { type: String, enum: ['admin', 'user'], default: 'admin' }
}, { timestamps: true });

const documentSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'processing' },
    chunkCount: { type: Number, default: 0 },
    tenantId: { type: String, required: true, index: true },
    fileSize: { type: Number, default: 0 }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    citations: { type: Array, default: [] },
    confidence: { type: Number, default: null }
}, { timestamps: true });

const chatSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true, index: true },
    visitorId: { type: String, required: true },
    tenantId: { type: String, required: true, index: true },
    metadata: { type: Object, default: {} },
    messages: [messageSchema]
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
export const Document = mongoose.model('Document', documentSchema);
export const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
export const Message = mongoose.model('Message', messageSchema);
