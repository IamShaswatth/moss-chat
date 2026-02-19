import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, Message } from '../models/index.js';
import { generateEmbedding } from '../services/rag/embeddings.js';
import { queryVectors } from '../services/rag/pinecone.js';
import { getAIProvider } from '../services/ai/index.js';
import { detectLanguage } from '../services/language.js';

const router = Router();

const SIMILARITY_THRESHOLD = 0.15;

// SSE Chat endpoint (public - for widget)
router.post('/', async (req, res) => {
    try {
        const { message, tenantId, sessionId, visitorId } = req.body;

        if (!message || !tenantId) {
            return res.status(400).json({ error: 'Message and tenantId required' });
        }

        // Set up SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // 1. Detect language
        const language = detectLanguage(message);

        // 2. Generate query embedding
        const queryEmbedding = await generateEmbedding(message);

        // 3. Query Pinecone
        const results = await queryVectors(queryEmbedding, tenantId, 5);

        // 4. Get any matches above minimum threshold
        const relevantChunks = results.matches
            ? results.matches.filter(m => m.score >= SIMILARITY_THRESHOLD)
            : [];

        let responseText = '';
        let citations = [];
        let confidence = 0;

        if (relevantChunks.length === 0) {
            // Fallback message
            responseText = getFallbackMessage(language);
            confidence = 0;

            res.write(`data: ${JSON.stringify({ type: 'chunk', content: responseText })}\n\n`);
        } else {
            // 5. Build grounded prompt — pass ALL matches and let the AI decide
            const context = relevantChunks.map((chunk, i) => {
                citations.push({
                    index: i + 1,
                    text: chunk.metadata.text.substring(0, 200) + '...',
                    score: Math.round(chunk.score * 100) / 100,
                    documentId: chunk.metadata.documentId
                });
                return `[Source ${i + 1}]: ${chunk.metadata.text}`;
            }).join('\n\n');

            confidence = Math.round(
                (relevantChunks.reduce((sum, c) => sum + c.score, 0) / relevantChunks.length) * 100
            ) / 100;

            const systemPrompt = buildSystemPrompt(context, language);

            // 6. Stream AI response
            const aiProvider = getAIProvider();
            const stream = aiProvider.streamChat(message, systemPrompt);

            for await (const chunk of stream) {
                responseText += chunk;
                res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
            }
        }

        // Send final event with metadata
        res.write(`data: ${JSON.stringify({
            type: 'done',
            language
        })}\n\n`);

        res.end();

        // Store chat session & message
        await storeChatMessage({
            sessionId: sessionId || uuidv4(),
            visitorId: visitorId || 'anonymous',
            tenantId,
            userMessage: message,
            assistantMessage: responseText,
            citations,
            confidence
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'An error occurred' })}\n\n`);
        res.end();
    }
});

// Get chat sessions (admin)
router.get('/sessions', async (req, res) => {
    try {
        const tenantId = req.query.tenantId;
        if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

        const sessions = await findSessions(tenantId);
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Get session messages
router.get('/sessions/:id', async (req, res) => {
    try {
        const session = await findSessionById(req.params.id);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

function buildSystemPrompt(context, language) {
    return `You are a helpful customer support assistant. Answer questions based ONLY on the provided context.
If the context doesn't contain relevant information, say so honestly.
Respond in ${language || 'the same language as the user message'}.

Context:
${context}

Rules:
- Only use information from the provided context
- Do NOT include any source references or citations in your response
- Be concise, friendly, and helpful
- If unsure, say you don't have enough information
- Respond in the user's language`;
}

function getFallbackMessage(language) {
    const messages = {
        eng: "I'm sorry, I couldn't find relevant information to answer your question. Please try rephrasing or contact our support team directly.",
        hin: "क्षमा करें, मुझे आपके प्रश्न का उत्तर देने के लिए प्रासंगिक जानकारी नहीं मिली। कृपया दोबारा प्रयास करें या हमारी सहायता टीम से संपर्क करें।",
        spa: "Lo siento, no pude encontrar información relevante para responder su pregunta. Por favor, intente reformular o contacte a nuestro equipo de soporte.",
        fra: "Désolé, je n'ai pas trouvé d'informations pertinentes pour répondre à votre question. Veuillez reformuler ou contacter notre équipe support."
    };
    return messages[language] || messages.eng;
}

async function storeChatMessage({ sessionId, visitorId, tenantId, userMessage, assistantMessage, citations, confidence }) {
    try {
        if (process.env.DATABASE_TYPE === 'postgresql') {
            let session = await ChatSession.findOne({ where: { id: sessionId } });
            if (!session) {
                session = await ChatSession.create({ id: sessionId, visitorId, tenantId });
            }
            await Message.create({ sessionId, role: 'user', content: userMessage });
            await Message.create({ sessionId, role: 'assistant', content: assistantMessage, citations, confidence });
        } else {
            let session = await ChatSession.findOne({ sessionId });
            if (!session) {
                session = new ChatSession({ sessionId, visitorId, tenantId, messages: [] });
            }
            session.messages.push({ role: 'user', content: userMessage });
            session.messages.push({ role: 'assistant', content: assistantMessage, citations, confidence });
            await session.save();
        }
    } catch (err) {
        console.error('Failed to store chat message:', err);
    }
}

async function findSessions(tenantId) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return ChatSession.findAll({ where: { tenantId }, order: [['createdAt', 'DESC']], limit: 50 });
    }
    return ChatSession.find({ tenantId }).sort({ createdAt: -1 }).limit(50);
}

async function findSessionById(id) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return ChatSession.findOne({ where: { id }, include: [{ model: Message, as: 'messages' }] });
    }
    return ChatSession.findOne({ sessionId: id });
}

export default router;
