import { Router } from 'express';
import { injectTenant } from '../middleware/defaultTenant.js';
import { Document, ChatSession, UnansweredQuestion, FaqEntry, ProductCatalog } from '../models/index.js';
import { getAIProvider } from '../services/ai/index.js';

const router = Router();

// Get unanswered questions (suggestions) — only pending ones
router.get('/suggestions', injectTenant, async (req, res) => {
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
router.delete('/suggestions/:id', injectTenant, async (req, res) => {
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
router.post('/generate-faqs', injectTenant, async (req, res) => {
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
router.post('/suggestions/:id/approve', injectTenant, async (req, res) => {
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
router.get('/faqs', injectTenant, async (req, res) => {
    try {
        const faqs = await FaqEntry.find({ tenantId: req.tenantId, isActive: true })
            .sort({ createdAt: -1 });
        res.json(faqs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch FAQs' });
    }
});

// Delete a FAQ entry
router.delete('/faqs/:id', injectTenant, async (req, res) => {
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
router.get('/', injectTenant, async (req, res) => {
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

// Charts analytics — aggregated data for the Charts page
router.get('/charts', injectTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;

        // 1. Top frequently asked questions (from UnansweredQuestion collection)
        const topQuestions = await UnansweredQuestion.find({ tenantId })
            .sort({ count: -1 })
            .limit(15)
            .lean();

        // 2. Questions by relevance score buckets
        const allQuestions = await UnansweredQuestion.find({ tenantId }).lean();
        const scoreBuckets = { high: 0, medium: 0, low: 0 };
        allQuestions.forEach(q => {
            if (q.score >= 0.4) scoreBuckets.high++;
            else if (q.score >= 0.25) scoreBuckets.medium++;
            else scoreBuckets.low++;
        });

        // 3. Product mention analysis — scan user messages for product name mentions
        const products = await ProductCatalog.find({ tenantId }).lean();
        const sessions = await ChatSession.find({ tenantId }).lean();

        const productMentions = {};
        const categoryMentions = {};

        if (products.length > 0) {
            // Build lookup: lowercase product name → product
            const productLookup = products.map(p => ({
                name: p.name,
                nameLower: p.name.toLowerCase(),
                category: p.category || 'Uncategorized',
                // Also create keyword fragments for partial matching
                keywords: p.name.toLowerCase().split(/[\s\-\/,]+/).filter(w => w.length > 2)
            }));

            // Scan all user messages
            sessions.forEach(session => {
                session.messages?.forEach(msg => {
                    if (msg.role !== 'user') return;
                    const msgLower = msg.content.toLowerCase();

                    productLookup.forEach(p => {
                        // Exact name match or keyword match
                        const matched = msgLower.includes(p.nameLower) ||
                            p.keywords.some(kw => msgLower.includes(kw));

                        if (matched) {
                            productMentions[p.name] = (productMentions[p.name] || 0) + 1;
                            categoryMentions[p.category] = (categoryMentions[p.category] || 0) + 1;
                        }
                    });
                });
            });
        }

        // Sort product mentions by count
        const topProducts = Object.entries(productMentions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([name, count]) => ({ name, count }));

        const topCategories = Object.entries(categoryMentions)
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({ category, count }));

        // 4. Chat volume over time (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const chatsByDay = {};
        sessions.forEach(session => {
            const date = session.createdAt ? new Date(session.createdAt).toISOString().split('T')[0] : null;
            if (date && new Date(date) >= thirtyDaysAgo) {
                chatsByDay[date] = (chatsByDay[date] || 0) + 1;
            }
        });

        // Fill in missing days with 0
        const chatVolume = [];
        for (let d = new Date(thirtyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().split('T')[0];
            chatVolume.push({ date: key, count: chatsByDay[key] || 0 });
        }

        // 5. Question status breakdown
        const statusCounts = { pending: 0, converted: 0, dismissed: 0 };
        allQuestions.forEach(q => {
            statusCounts[q.status] = (statusCounts[q.status] || 0) + 1;
        });

        // 6. Average confidence score from chat messages
        let totalConfidence = 0, confidenceCount = 0;
        sessions.forEach(session => {
            session.messages?.forEach(msg => {
                if (msg.role === 'assistant' && msg.confidence != null && msg.confidence > 0) {
                    totalConfidence += msg.confidence;
                    confidenceCount++;
                }
            });
        });

        res.json({
            topQuestions: topQuestions.map(q => ({
                question: q.question,
                count: q.count,
                score: q.score,
                status: q.status,
                lastAskedAt: q.lastAskedAt
            })),
            scoreBuckets,
            topProducts,
            topCategories,
            chatVolume,
            questionStatus: statusCounts,
            totalQuestions: allQuestions.length,
            totalProducts: products.length,
            totalSessions: sessions.length,
            avgConfidence: confidenceCount > 0 ? Math.round((totalConfidence / confidenceCount) * 100) : 0
        });
    } catch (error) {
        console.error('Charts analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch chart data' });
    }
});

export default router;
