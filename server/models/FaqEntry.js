import mongoose from 'mongoose';

const faqEntrySchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, default: '' },
    tenantId: { type: String, required: true, index: true },
    sourceQueryId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnansweredQuestion', default: null },
    category: { type: String, default: 'General' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

faqEntrySchema.index({ tenantId: 1, question: 1 }, { unique: true });

export const FaqEntry = mongoose.model('FaqEntry', faqEntrySchema);
