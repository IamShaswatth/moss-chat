import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, Message, UnansweredQuestion, FaqEntry, ProductCatalog } from '../models/index.js';
import { generateEmbedding } from '../services/rag/embeddings.js';
import { queryVectors } from '../services/rag/pinecone.js';
import { getAIProvider } from '../services/ai/index.js';
import { detectLanguage, getLanguageName } from '../services/language.js';

const router = Router();

const SIMILARITY_THRESHOLD = 0.05;

// Normalize query for deduplication
function normalizeQuery(text) {
    return text.toLowerCase().trim().replace(/[^a-z0-9\s\u0900-\u097F\u4E00-\u9FFF]/g, '').replace(/\s+/g, ' ');
}

// Helper to store unanswered question
async function storeUnansweredQuestion(question, tenantId, score) {
    try {
        const normalized = normalizeQuery(question);
        await UnansweredQuestion.findOneAndUpdate(
            { tenantId, question },
            {
                $inc: { count: 1 },
                $set: { lastAskedAt: new Date(), score, normalizedHash: normalized },
                $setOnInsert: { firstAskedAt: new Date(), status: 'pending' }
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error('Failed to store unanswered question:', err);
    }
}

// AG-UI Protocol: SSE Chat endpoint (public - for widget)
router.post('/', async (req, res) => {
    const runId = uuidv4();
    const messageId = uuidv4();
    const now = () => new Date().toISOString();

    // Helper to emit AG-UI events
    const emit = (event) => {
        res.write(`data: ${JSON.stringify({ ...event, timestamp: now() })}\n\n`);
    };

    try {
        const { message, tenantId, sessionId, visitorId, userName, userEmail } = req.body;

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

        // AG-UI: Run started
        emit({ type: 'RUN_STARTED', runId, threadId: sessionId || runId });

        // 1. Detect language
        const language = detectLanguage(message);

        // AG-UI: RAG retrieval step
        emit({ type: 'STEP_STARTED', stepName: 'rag_retrieval' });

        // 2. Generate query embedding
        const queryEmbedding = await generateEmbedding(message);

        // 3. Query Pinecone — get more results, let LLM judge relevance
        const results = await queryVectors(queryEmbedding, tenantId, 8);

        // 4. Use ALL returned results (let the LLM decide relevance)
        const relevantChunks = results.matches || [];

        // UNANSWERED QUESTION LOGIC
        // If max score is moderate (0.20 - 0.55), it might be relevant but missing details
        // If max score is high (> 0.55), it's likely answered
        // If max score is low (< 0.20), it's likely irrelevant
        const maxScore = results.matches && results.matches.length > 0 ? results.matches[0].score : 0;
        console.log(`[RAG] Query: "${message}" | Max Score: ${maxScore}`);

        if (maxScore >= 0.20 && maxScore < 0.65) {
            console.log('[RAG] Capturing as suggestion');
            storeUnansweredQuestion(message, tenantId, maxScore);
        }

        // Fetch approved FAQ entries for this tenant to supplement context
        let faqContext = '';
        try {
            const faqs = await FaqEntry.find({ tenantId, isActive: true });
            if (faqs.length > 0) {
                faqContext = '\n\n--- Approved FAQ Entries ---\n' +
                    faqs.map(f => `Q: ${f.question}${f.answer ? '\nA: ' + f.answer : ''}`).join('\n\n');
            }
        } catch (e) { /* ignore FAQ fetch errors */ }

        // Fetch product catalog data for sales queries
        let productContext = '';
        try {
            const products = await ProductCatalog.find({ tenantId }).lean();
            if (products.length > 0) {
                productContext = '\n\n--- Product/Service Catalog (Prices & Items) ---\n' +
                    products.map(p => {
                        let line = `- ${p.name}`;
                        if (p.price != null) line += `: ${p.price}`;
                        if (p.unit) line += ` per ${p.unit}`;
                        if (p.category) line += ` [${p.category}]`;
                        if (p.description) line += ` — ${p.description}`;
                        // Include any extra fields
                        if (p.extraFields && Object.keys(p.extraFields).length > 0) {
                            line += ' (' + Object.entries(p.extraFields).map(([k,v]) => `${k}: ${v}`).join(', ') + ')';
                        }
                        return line;
                    }).join('\n');
                console.log(`[Products] Injected ${products.length} catalog items into context`);
            }
        } catch (e) { /* ignore product fetch errors */ }

        emit({ type: 'STEP_FINISHED', stepName: 'rag_retrieval' });

        let responseText = '';
        let citations = [];
        let confidence = 0;

        // AG-UI: Text message start
        emit({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });

        if (relevantChunks.length === 0 && !productContext && !faqContext) {
            // Fallback message — no RAG, no products, no FAQ
            responseText = getFallbackMessage(language);
            confidence = 0;

            emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: responseText });
        } else if (relevantChunks.length === 0 && (productContext || faqContext)) {
            // No RAG results but we have product catalog or FAQ data — let AI answer from those
            const context = (productContext || '') + (faqContext || '');
            confidence = 0.5;

            const systemPrompt = buildSystemPrompt(context, language, userName);
            emit({ type: 'STEP_STARTED', stepName: 'ai_generation' });

            const aiProvider = getAIProvider();
            const stream = aiProvider.streamChat(message, systemPrompt);

            for await (const chunk of stream) {
                responseText += chunk;
                emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: chunk });
            }

            emit({ type: 'STEP_FINISHED', stepName: 'ai_generation' });
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
            }).join('\n\n') + faqContext + productContext;

            confidence = Math.round(
                (relevantChunks.reduce((sum, c) => sum + c.score, 0) / relevantChunks.length) * 100
            ) / 100;

            const systemPrompt = buildSystemPrompt(context, language, userName);

            // AG-UI: Stream AI response as TEXT_MESSAGE_CONTENT events
            emit({ type: 'STEP_STARTED', stepName: 'ai_generation' });

            const aiProvider = getAIProvider();
            const stream = aiProvider.streamChat(message, systemPrompt);

            for await (const chunk of stream) {
                responseText += chunk;
                emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: chunk });
            }

            emit({ type: 'STEP_FINISHED', stepName: 'ai_generation' });
        }

        // AG-UI: Text message end
        emit({ type: 'TEXT_MESSAGE_END', messageId });

        // AG-UI: Run finished
        emit({ type: 'RUN_FINISHED', runId, result: { language } });

        // Store chat session & message BEFORE closing the connection
        try {
            await storeChatMessage({
                sessionId: sessionId || uuidv4(),
                visitorId: visitorId || 'anonymous',
                tenantId,
                userMessage: message,
                assistantMessage: responseText,
                citations,
                confidence,
                userName: userName || null,
                userEmail: userEmail || null
            });
            console.log(`[Chat] Stored message for session ${sessionId}`);
        } catch (storeErr) {
            console.error('[Chat] FAILED to store message:', storeErr);
        }

        res.end();

    } catch (error) {
        console.error('Chat error:', error);
        const errorMsg = 'Sorry, an error occurred. Please try again.';
        try {
            emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: errorMsg });
            emit({ type: 'TEXT_MESSAGE_END', messageId });
            emit({ type: 'RUN_ERROR', runId, message: 'An error occurred', code: 'INTERNAL_ERROR' });
        } catch (e) { /* headers already sent */ }

        // Store even on error
        try {
            await storeChatMessage({
                sessionId: sessionId || uuidv4(),
                visitorId: visitorId || 'anonymous',
                tenantId,
                userMessage: message,
                assistantMessage: responseText || errorMsg,
                citations: [],
                confidence: 0,
                userName: userName || null,
                userEmail: userEmail || null
            });
            console.log(`[Chat] Stored error message for session ${sessionId}`);
        } catch (storeErr) {
            console.error('[Chat] FAILED to store error message:', storeErr);
        }

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

function buildSystemPrompt(context, language, userName) {
    const langName = getLanguageName(language);
    const userGreeting = userName ? `\nThe customer's name is ${userName}. Address them by name when appropriate to make the conversation personal.` : '';
    return `You are a helpful AI assistant for a business. You answer customer questions using the retrieved knowledge base context provided below.${userGreeting}

You MUST respond in **${langName}** language.

----------------------------------------------------
RULES
----------------------------------------------------

1. ALWAYS use the Retrieved Context below to answer. The context IS relevant — it was retrieved specifically for this query.
2. If the context contains information related to the question, USE IT to give a helpful answer. Summarize, list items, or explain as needed.
3. Do NOT invent facts, prices, services, or policies that are not in the context.
4. Only say you cannot help if the context is truly about a completely different topic with zero relevance.
5. Be friendly, professional, and concise.
6. If the user asks about pricing and prices are in the context, list them clearly.
7. If the user asks a broad question like "services" or "what do you offer", summarize everything available in the context.
8. Do NOT include source references or citations in your response.

----------------------------------------------------
UPSELL (OPTIONAL)
----------------------------------------------------

If the user asks about a specific service/product and the context mentions related ones, you may briefly suggest 1-2 complementary items.

Retrieved Context:
${context}`;
}

function getFallbackMessage(language) {
    const messages = {
        eng: "I'm sorry, I couldn't find relevant information to answer your question. Please try rephrasing or contact our support team directly.",
        hin: "क्षमा करें, मुझे आपके प्रश्न का उत्तर देने के लिए प्रासंगिक जानकारी नहीं मिली। कृपया दोबारा प्रयास करें या हमारी सहायता टीम से संपर्क करें।",
        ben: "দুঃখিত, আপনার প্রশ্নের উত্তর দেওয়ার জন্য প্রাসঙ্গিক তথ্য পাওয়া যায়নি। অনুগ্রহ করে পুনরায় চেষ্টা করুন।",
        tam: "மன்னிக்கவும், உங்கள் கேள்விக்கு பதிலளிக்க தொடர்புடைய தகவல் கிடைக்கவில்லை। மீண்டும் முயற்சிக்கவும்.",
        tel: "క్షమించండి, మీ ప్రశ్నకు సమాధానమివ్వడానికి సంబంధిత సమాచారం కనుగొనబడలేదు. దయచేసి మళ్ళీ ప్రయత్నించండి.",
        mar: "क्षमस्व, तुमच्या प्रश्नाचे उत्तर देण्यासाठी संबंधित माहिती सापडली नाही. कृपया पुन्हा प्रयत्न करा.",
        guj: "માફ કરશો, તમારા પ્રશ્નનો જવાબ આપવા માટે સંબંધિત માહિતી મળી નથી. કૃપા કરીને ફરી પ્રયાસ કરો.",
        kan: "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಲು ಸಂಬಂಧಿತ ಮಾಹಿತಿ ಕಂಡುಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
        mal: "ക്ഷമിക്കണം, നിങ്ങളുടെ ചോദ്യത്തിന് ഉത്തരം നൽകാൻ പ്രസക്തമായ വിവരങ്ങൾ കണ്ടെത്താനായില്ല. വീണ്ടും ശ്രമിക്കുക.",
        pan: "ਮੁਆਫ਼ ਕਰਨਾ, ਤੁਹਾਡੇ ਸਵਾਲ ਦਾ ਜਵਾਬ ਦੇਣ ਲਈ ਸੰਬੰਧਿਤ ਜਾਣਕਾਰੀ ਨਹੀਂ ਮਿਲੀ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
        spa: "Lo siento, no pude encontrar información relevante para responder su pregunta. Por favor, intente reformular o contacte a nuestro equipo de soporte.",
        fra: "Désolé, je n'ai pas trouvé d'informations pertinentes pour répondre à votre question. Veuillez reformuler ou contacter notre équipe support.",
        deu: "Es tut mir leid, ich konnte keine relevanten Informationen finden, um Ihre Frage zu beantworten. Bitte versuchen Sie es erneut.",
        por: "Desculpe, não consegui encontrar informações relevantes para responder sua pergunta. Por favor, tente reformular.",
        ita: "Mi dispiace, non ho trovato informazioni pertinenti per rispondere alla tua domanda. Per favore, riprova.",
        jpn: "申し訳ございません。ご質問に関連する情報が見つかりませんでした。別の表現でお試しください。",
        kor: "죄송합니다. 질문에 관련된 정보를 찾을 수 없습니다. 다시 시도해 주세요.",
        zho: "抱歉，未能找到与您问题相关的信息。请尝试重新表述或联系我们的客服团队。",
        ara: "عذراً، لم أتمكن من العثور على معلومات ذات صلة للإجابة على سؤالك. يرجى إعادة المحاولة أو التواصل مع فريق الدعم.",
        rus: "Извините, я не смог найти соответствующую информацию для ответа на ваш вопрос. Пожалуйста, попробуйте ещё раз.",
        tha: "ขออภัย ไม่พบข้อมูลที่เกี่ยวข้องสำหรับคำถามของคุณ กรุณาลองอีกครั้ง"
    };
    return messages[language] || messages.eng;
}

async function storeChatMessage({ sessionId, visitorId, tenantId, userMessage, assistantMessage, citations, confidence, userName, userEmail }) {
    try {
        if (process.env.DATABASE_TYPE === 'postgresql') {
            let session = await ChatSession.findOne({ where: { id: sessionId } });
            if (!session) {
                session = await ChatSession.create({ id: sessionId, visitorId, tenantId, userName, userEmail });
            }
            await Message.create({ sessionId, role: 'user', content: userMessage });
            await Message.create({ sessionId, role: 'assistant', content: assistantMessage, citations, confidence });
        } else {
            let session = await ChatSession.findOne({ sessionId });
            if (!session) {
                session = new ChatSession({ sessionId, visitorId, tenantId, userName, userEmail, messages: [] });
            } else if (userName && !session.userName) {
                session.userName = userName;
                session.userEmail = userEmail;
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
    // Try by sessionId first, then by MongoDB _id
    let session = await ChatSession.findOne({ sessionId: id });
    if (!session) {
        session = await ChatSession.findById(id).catch(() => null);
    }
    return session;
}

export default router;
