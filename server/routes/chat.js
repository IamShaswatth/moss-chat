import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, Message, UnansweredQuestion, FaqEntry } from '../models/index.js';
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

        emit({ type: 'STEP_FINISHED', stepName: 'rag_retrieval' });

        let responseText = '';
        let citations = [];
        let confidence = 0;

        // AG-UI: Text message start
        emit({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });

        if (relevantChunks.length === 0) {
            // Fallback message
            responseText = getFallbackMessage(language);
            confidence = 0;

            emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: responseText });
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
            }).join('\n\n') + faqContext;

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

        res.end();

        // Store chat session & message
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

    } catch (error) {
        console.error('Chat error:', error);
        emit({ type: 'RUN_ERROR', runId, message: 'An error occurred', code: 'INTERNAL_ERROR' });
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
    return `You are an AI assistant for a business using a structured catalog and retrieved knowledge base.${userGreeting}

You may receive two types of context:
1. Retrieved document chunks (RAG context)
2. Structured catalog data:
   - Requested item (name, price, description, category)
   - Related items (name, price, description, category)

Your job is to provide accurate, grounded responses and optionally assist with sales in a professional manner.

----------------------------------------------------
GENERAL GROUNDING RULES
----------------------------------------------------

1. Answer strictly using:
   - Retrieved document chunks
   - Structured catalog data (if provided)
2. Do NOT invent products, services, prices, policies, or offers.
3. Do NOT assume availability unless explicitly stated.
4. If something is not present in the provided context, respond:
   "This information is not available in the provided records."
5. Maintain a professional and neutral tone.
6. Do NOT imitate slang or informal language from the user.
7. You MUST respond in **${langName}** language. The user is communicating in ${langName}. Maintain professional tone in all languages.

----------------------------------------------------
INTENT HANDLING
----------------------------------------------------

If structured catalog data is provided, assume the backend has already:
- Detected product/service or pricing intent
- Identified the requested item
- Provided 1–2 related items (if applicable)

You must:
- Prioritize structured catalog data for pricing and product details.
- Use RAG context for policies, descriptions, or additional clarification.

----------------------------------------------------
UPSELL & CROSS-SELL BEHAVIOR
----------------------------------------------------

If:
- The user asks about price, availability, features, or details
AND
- Related items are provided in the structured catalog context

Then:
1. First, clearly answer the user's main question.
2. Then, optionally suggest up to two related complementary items.
3. Keep suggestions concise and non-aggressive.
4. Only suggest items explicitly provided in the structured catalog.
5. Do NOT generate suggestions if no related items are provided.

Suggestion Format:
- Provide the direct answer first.
- Then add one short optional sentence:
  "You may also consider [Item Name], priced at [Price]."

----------------------------------------------------
MULTI-CONDITION SAFETY
----------------------------------------------------

If the question contains multiple parts:
- Address each part clearly.
- If one part is not supported by provided records, state that clearly while answering the supported part.

----------------------------------------------------
FALLBACK SAFETY
----------------------------------------------------

If the requested item is not found in the structured catalog:
Respond: "This item is not listed in the available records."

If context is insufficient:
Respond: "This information is not available in the provided records."

Never guess.
Never hallucinate.
Never fabricate discounts or limited offers.

----------------------------------------------------
GOAL
----------------------------------------------------

Provide accurate information and gently support revenue growth by suggesting relevant complementary items when appropriate, without compromising factual correctness or trust.

Do NOT include source references or citations in your response.

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
