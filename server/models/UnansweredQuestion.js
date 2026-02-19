import mongoose from 'mongoose';

const unansweredQuestionSchema = new mongoose.Schema({
    question: { type: String, required: true, index: true },
    normalizedHash: { type: String, index: true },
    tenantId: { type: String, required: true, index: true },
    score: { type: Number, required: true },
    count: { type: Number, default: 1 },
    status: { type: String, enum: ['pending', 'converted', 'dismissed'], default: 'pending' },
    lastAskedAt: { type: Date, default: Date.now },
    firstAskedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound index to quickly find duplicate questions for a tenant
unansweredQuestionSchema.index({ tenantId: 1, question: 1 }, { unique: true });

export const UnansweredQuestion = mongoose.model('UnansweredQuestion', unansweredQuestionSchema);

