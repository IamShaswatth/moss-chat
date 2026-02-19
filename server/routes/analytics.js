import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { Document, ChatSession, UnansweredQuestion, FaqEntry } from '../models/index.js';
import { getAIProvider } from '../services/ai/index.js';

const router = Router();

// Get unanswered questions (suggestions) — only pending ones
router.get('/suggestions', authenticate, enforceTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const suggestions = await UnansweredQuestion.find({ tenantId, status: 'pending' })
            .sort({ count: -1, lastAskedAt: -1 })
            .limit(50);
        res.json(suggestions);
    } catch (error) {
        console.error('Suggestions error:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});

// Dismiss a suggestion
router.delete('/suggestions/:id', authenticate, enforceTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        await UnansweredQuestion.findOneAndUpdate(
            { _id: req.params.id, tenantId },
            { status: 'dismissed' }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to dismiss suggestion' });
    }
});

// Generate AI-powered FAQ suggestions from frequent queries
router.post('/generate-faqs', authenticate, enforceTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;

        // 1. Get top frequent pending queries
        const topQueries = await UnansweredQuestion.find({ tenantId, status: 'pending' })
            .sort({ count: -1 })
            .limit(10);

        if (topQueries.length === 0) {
            return res.json({ suggestions: [], message: 'No unanswered queries to analyze.' });
        }

        // 2. Get existing FAQ entries for comparison
        const existingFaqs = await FaqEntry.find({ tenantId, isActive: true });

        // 3. Build LLM prompt
        const queryList = topQueries.map((q, i) =>
            `${i + 1}. "${q.question}" (asked ${q.count} times, relevance: ${Math.round(q.score * 100)}%)`
        ).join('\n');

        const existingList = existingFaqs.length > 0
            ? existingFaqs.map((f, i) => `${i + 1}. ${f.question}`).join('\n')
            : 'No existing FAQs.';

        const prompt = `You are a Knowledge Optimization Assistant for a business.

You are given:
1. A list of frequently asked user questions.
2. Existing FAQ titles or knowledge entries.

Your task:

1. Identify recurring questions that:
   - Are not already covered by existing FAQs.
   - Are relevant to the business.
   - Can be generalized into reusable FAQ questions.

2. Remove:
   - Duplicate questions.
   - Off-topic queries.
   - One-time or personal requests.

3. For each selected question:
   - Rewrite into a clear, professional FAQ-style question.
   - Keep wording general and reusable.
   - Do NOT include personal data.
   - Do NOT invent new information.
   - Do NOT create answers unless explicitly requested.

4. Return up to 5 suggested FAQ additions.

SAFETY RULES:
- Do not fabricate statistics.
- Do not invent new services or policies.
- Only use provided frequent queries.
- Do not generate answers.
- Maintain professional tone.

FREQUENT USER QUERIES:
${queryList}

EXISTING FAQ ENTRIES:
${existingList}

Respond in valid JSON format only. Return an array of objects:
[
  {
    "suggestedQuestion": "...",
    "reason": "...",
    "frequency": <number>,
    "originalQuery": "..."
  }
]`;

        // 4. Call LLM
        const aiProvider = getAIProvider();
        let fullResponse = '';
        const stream = aiProvider.streamChat(prompt, 'You are a helpful assistant that returns valid JSON only. No markdown, no code blocks, just a JSON array.');
        for await (const chunk of stream) {
            fullResponse += chunk;
        }

        // 5. Parse response
        let suggestions = [];
        try {
            // Strip markdown code blocks if present
            const cleaned = fullResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            suggestions = JSON.parse(cleaned);
        } catch (parseErr) {
            console.error('Failed to parse LLM response:', fullResponse);
            return res.status(500).json({ error: 'Failed to parse AI suggestions' });
        }

        res.json({ suggestions });
    } catch (error) {
        console.error('FAQ generation error:', error);
        res.status(500).json({ error: 'Failed to generate FAQ suggestions' });
    }
});

// Approve a suggestion → convert to FAQ entry
router.post('/suggestions/:id/approve', authenticate, enforceTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { faqQuestion } = req.body; // The rewritten FAQ question from LLM

        const suggestion = await UnansweredQuestion.findOne({ _id: req.params.id, tenantId });
        if (!suggestion) {
            return res.status(404).json({ error: 'Suggestion not found' });
        }

        // Create FAQ entry
        const faq = await FaqEntry.findOneAndUpdate(
            { tenantId, question: faqQuestion || suggestion.question },
            {
                question: faqQuestion || suggestion.question,
                tenantId,
                sourceQueryId: suggestion._id,
                isActive: true
            },
            { upsert: true, new: true }
        );

        // Mark suggestion as converted
        suggestion.status = 'converted';
        await suggestion.save();

        res.json({ success: true, faq });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Failed to approve suggestion' });
    }
});

// Get all FAQ entries for a tenant
router.get('/faqs', authenticate, enforceTenant, async (req, res) => {
    try {
        const faqs = await FaqEntry.find({ tenantId: req.tenantId, isActive: true })
            .sort({ createdAt: -1 });
        res.json(faqs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch FAQs' });
    }
});

// Delete a FAQ entry
router.delete('/faqs/:id', authenticate, enforceTenant, async (req, res) => {
    try {
        await FaqEntry.findOneAndUpdate(
            { _id: req.params.id, tenantId: req.tenantId },
            { isActive: false }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete FAQ' });
    }
});

// Dashboard analytics
router.get('/', authenticate, enforceTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;

        let totalDocuments, totalChats, recentDocuments;

        if (process.env.DATABASE_TYPE === 'postgresql') {
            totalDocuments = await Document.count({ where: { tenantId } });
            totalChats = await ChatSession.count({ where: { tenantId } });
            recentDocuments = await Document.findAll({
                where: { tenantId },
                order: [['createdAt', 'DESC']],
                limit: 5
            });
        } else {
            totalDocuments = await Document.countDocuments({ tenantId });
            totalChats = await ChatSession.countDocuments({ tenantId });
            recentDocuments = await Document.find({ tenantId })
                .sort({ createdAt: -1 })
                .limit(5);
        }

        res.json({
            totalDocuments,
            totalChats,
            recentDocuments
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

export default router;
