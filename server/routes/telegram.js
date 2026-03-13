import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession, UnansweredQuestion, FaqEntry, ProductCatalog } from '../models/index.js';
import { generateEmbedding } from '../services/rag/embeddings.js';
import { queryVectors } from '../services/rag/pinecone.js';
import { getAIProvider } from '../services/ai/index.js';
import { detectLanguage, getLanguageName } from '../services/language.js';

const router = Router();

const TELEGRAM_API = 'https://api.telegram.org/bot';

// ─── Helpers ─────────────────────────────────────────

function getTelegramToken() {
    return process.env.TELEGRAM_BOT_TOKEN;
}

function getTenantId() {
    return process.env.DEFAULT_TENANT_ID || 'default-tenant';
}

async function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
    const token = getTelegramToken();
    try {
        const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: parseMode
            })
        });
        const data = await res.json();
        if (!data.ok) {
            // Retry without parse_mode if markdown fails
            if (parseMode === 'Markdown') {
                return sendTelegramMessage(chatId, text, undefined);
            }
            console.error('[Telegram] Send failed:', data.description);
        }
        return data;
    } catch (err) {
        console.error('[Telegram] Send error:', err.message);
    }
}

async function sendTypingAction(chatId) {
    const token = getTelegramToken();
    try {
        await fetch(`${TELEGRAM_API}${token}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' })
        });
    } catch (e) { /* ignore */ }
}

// ─── Core RAG pipeline (reused from chat.js) ─────────

function buildSystemPrompt(context, language, userName) {
    const langName = getLanguageName(language);
    const userGreeting = userName ? `\nThe customer's name is ${userName}. Address them by name when appropriate.` : '';
    return `You are a helpful AI assistant for a business. You answer customer questions using the retrieved knowledge base context provided below.${userGreeting}

You MUST respond in **${langName}** language.

RULES:
1. ALWAYS use the Retrieved Context below to answer.
2. If the context contains information related to the question, USE IT.
3. Do NOT invent facts, prices, services, or policies not in the context.
4. Only say you cannot help if the context is truly about a completely different topic.
5. Be friendly, professional, and concise.
6. If the user asks about pricing, list prices clearly.
7. If the user asks a broad question, summarize everything available.
8. Do NOT include source references or citations.
9. Keep responses compact — suitable for a chat message (not a long essay).

If the user asks about a specific service/product and the context mentions related ones, briefly suggest 1-2 complementary items.

Retrieved Context:
${context}`;
}

function getFallbackMessage(language) {
    const messages = {
        eng: "I'm sorry, I couldn't find relevant information to answer your question. Please try rephrasing or contact our support team directly.",
        hin: "क्षमा करें, मुझे आपके प्रश्न का उत्तर देने के लिए प्रासंगिक जानकारी नहीं मिली। कृपया दोबारा प्रयास करें।",
    };
    return messages[language] || messages.eng;
}

async function processMessage(userMessage, userName) {
    const tenantId = getTenantId();
    const language = detectLanguage(userMessage);

    // 1. Generate embedding and query Pinecone
    const queryEmbedding = await generateEmbedding(userMessage);
    const results = await queryVectors(queryEmbedding, tenantId, 8);
    const relevantChunks = results.matches || [];
    const maxScore = relevantChunks.length > 0 ? relevantChunks[0].score : 0;

    console.log(`[Telegram RAG] "${userMessage}" | Score: ${maxScore}`);

    // Track unanswered questions
    if (maxScore >= 0.20 && maxScore < 0.65) {
        try {
            const normalized = userMessage.toLowerCase().trim().replace(/[^a-z0-9\s\u0900-\u097F]/g, '').replace(/\s+/g, ' ');
            await UnansweredQuestion.findOneAndUpdate(
                { tenantId, question: userMessage },
                {
                    $inc: { count: 1 },
                    $set: { lastAskedAt: new Date(), score: maxScore, normalizedHash: normalized },
                    $setOnInsert: { firstAskedAt: new Date(), status: 'pending' }
                },
                { upsert: true, new: true }
            );
        } catch (e) { /* ignore */ }
    }

    // 2. Fetch FAQ + Product context
    let faqContext = '';
    try {
        const faqs = await FaqEntry.find({ tenantId, isActive: true });
        if (faqs.length > 0) {
            faqContext = '\n\n--- FAQ ---\n' +
                faqs.map(f => `Q: ${f.question}${f.answer ? '\nA: ' + f.answer : ''}`).join('\n\n');
        }
    } catch (e) { }

    let productContext = '';
    try {
        const products = await ProductCatalog.find({ tenantId }).lean();
        if (products.length > 0) {
            productContext = '\n\n--- Product/Service Catalog ---\n' +
                products.map(p => {
                    let line = `- ${p.name}`;
                    if (p.price != null) line += `: ${p.price}`;
                    if (p.unit) line += ` per ${p.unit}`;
                    if (p.category) line += ` [${p.category}]`;
                    if (p.description) line += ` — ${p.description}`;
                    if (p.extraFields && Object.keys(p.extraFields).length > 0) {
                        line += ' (' + Object.entries(p.extraFields).map(([k, v]) => `${k}: ${v}`).join(', ') + ')';
                    }
                    return line;
                }).join('\n');
        }
    } catch (e) { }

    // 3. Build context and generate response
    let responseText = '';
    let confidence = 0;

    if (relevantChunks.length === 0 && !productContext && !faqContext) {
        responseText = getFallbackMessage(language);
    } else {
        let context = '';
        if (relevantChunks.length > 0) {
            context = relevantChunks.map((chunk, i) =>
                `[Source ${i + 1}]: ${chunk.metadata.text}`
            ).join('\n\n');
            confidence = Math.round(
                (relevantChunks.reduce((sum, c) => sum + c.score, 0) / relevantChunks.length) * 100
            ) / 100;
        }
        context += faqContext + productContext;

        const systemPrompt = buildSystemPrompt(context, language, userName);
        const aiProvider = getAIProvider();
        const stream = aiProvider.streamChat(userMessage, systemPrompt);

        for await (const chunk of stream) {
            responseText += chunk;
        }
    }

    return { responseText, confidence, tenantId };
}

async function storeTelegramChat({ chatId, userMessage, assistantMessage, confidence, userName, tenantId }) {
    try {
        const sessionId = `telegram_${chatId}`;
        let session = await ChatSession.findOne({ sessionId });
        if (!session) {
            session = new ChatSession({
                sessionId,
                visitorId: `tg_${chatId}`,
                tenantId,
                userName: userName || null,
                messages: []
            });
        }
        session.messages.push({ role: 'user', content: userMessage });
        session.messages.push({ role: 'assistant', content: assistantMessage, confidence });
        await session.save();
    } catch (err) {
        console.error('[Telegram] Failed to store chat:', err.message);
    }
}

// ─── Webhook endpoint ────────────────────────────────

router.post('/webhook', async (req, res) => {
    // Respond immediately to Telegram (they expect 200 within seconds)
    res.sendStatus(200);

    try {
        const update = req.body;

        // Handle only text messages
        if (!update.message || !update.message.text) return;

        const chatId = update.message.chat.id;
        const userMessage = update.message.text.trim();
        const userName = update.message.from?.first_name || null;

        // Handle /start command
        if (userMessage === '/start') {
            await sendTelegramMessage(chatId,
                `👋 Hello${userName ? ' ' + userName : ''}! I'm your AI assistant.\n\nAsk me anything about our services, products, or prices. I'm here to help!`
            );
            return;
        }

        // Handle /help command
        if (userMessage === '/help') {
            await sendTelegramMessage(chatId,
                `🤖 *How to use this bot:*\n\n` +
                `Simply type your question and I'll answer based on our knowledge base.\n\n` +
                `*Examples:*\n` +
                `• "What services do you offer?"\n` +
                `• "How much does a haircut cost?"\n` +
                `• "Tell me about your packages"\n\n` +
                `Type anything to get started!`
            );
            return;
        }

        // Show typing indicator
        await sendTypingAction(chatId);

        // Process through RAG pipeline
        const { responseText, confidence, tenantId } = await processMessage(userMessage, userName);

        // Send response
        await sendTelegramMessage(chatId, responseText);

        // Store in DB (same collection as widget chats)
        await storeTelegramChat({
            chatId,
            userMessage,
            assistantMessage: responseText,
            confidence,
            userName,
            tenantId
        });

        console.log(`[Telegram] ${userName || chatId}: "${userMessage}" → ${responseText.length} chars`);

    } catch (error) {
        console.error('[Telegram] Webhook error:', error);
        try {
            const chatId = req.body?.message?.chat?.id;
            if (chatId) {
                await sendTelegramMessage(chatId, 'Sorry, something went wrong. Please try again.');
            }
        } catch (e) { }
    }
});

// ─── Webhook setup/status ────────────────────────────

// GET /api/telegram/status — check webhook status
router.get('/status', async (req, res) => {
    const token = getTelegramToken();
    if (!token) {
        return res.json({ configured: false, error: 'TELEGRAM_BOT_TOKEN not set in .env' });
    }
    try {
        const r = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`);
        const data = await r.json();
        const me = await fetch(`${TELEGRAM_API}${token}/getMe`).then(r => r.json());
        res.json({
            configured: true,
            bot: me.result,
            webhook: data.result
        });
    } catch (err) {
        res.json({ configured: false, error: err.message });
    }
});

// POST /api/telegram/setup — register webhook with Telegram
router.post('/setup', async (req, res) => {
    const token = getTelegramToken();
    if (!token) {
        return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set in .env' });
    }

    const { webhookUrl } = req.body;
    if (!webhookUrl) {
        return res.status(400).json({ error: 'webhookUrl is required (e.g., https://yourdomain.com/api/telegram/webhook)' });
    }

    try {
        const r = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl })
        });
        const data = await r.json();
        console.log('[Telegram] Webhook set:', data);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/telegram/remove — remove webhook
router.post('/remove', async (req, res) => {
    const token = getTelegramToken();
    if (!token) return res.status(400).json({ error: 'No token' });

    try {
        const r = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: '' })
        });
        const data = await r.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Long Polling Mode (localhost, no tunnel needed) ─

let pollingActive = false;
let pollingOffset = 0;

async function handleUpdate(update) {
    try {
        if (!update.message || !update.message.text) return;

        const chatId = update.message.chat.id;
        const userMessage = update.message.text.trim();
        const userName = update.message.from?.first_name || null;

        if (userMessage === '/start') {
            await sendTelegramMessage(chatId,
                `👋 Hello${userName ? ' ' + userName : ''}! I'm your AI assistant.\n\nAsk me anything about our services, products, or prices!`
            );
            return;
        }
        if (userMessage === '/help') {
            await sendTelegramMessage(chatId,
                `🤖 *How to use this bot:*\n\nJust type your question and I'll answer from our knowledge base.\n\n*Examples:*\n• "What services do you offer?"\n• "How much does a haircut cost?"\n• "Tell me about your packages"`
            );
            return;
        }

        await sendTypingAction(chatId);
        const { responseText, confidence, tenantId } = await processMessage(userMessage, userName);
        await sendTelegramMessage(chatId, responseText);
        await storeTelegramChat({ chatId, userMessage, assistantMessage: responseText, confidence, userName, tenantId });
        console.log(`[Telegram Poll] ${userName || chatId}: "${userMessage}" → ${responseText.length} chars`);
    } catch (err) {
        console.error('[Telegram Poll] Error handling update:', err.message);
        try {
            const chatId = update?.message?.chat?.id;
            if (chatId) await sendTelegramMessage(chatId, 'Sorry, something went wrong. Please try again.');
        } catch (e) { }
    }
}

async function pollLoop() {
    const token = getTelegramToken();
    if (!token) {
        console.error('[Telegram] No bot token, cannot start polling');
        pollingActive = false;
        return;
    }

    while (pollingActive) {
        try {
            const r = await fetch(`${TELEGRAM_API}${token}/getUpdates?offset=${pollingOffset}&timeout=30`, {
                signal: AbortSignal.timeout(35000)
            });
            const data = await r.json();

            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    pollingOffset = update.update_id + 1;
                    // Process each update (don't await to avoid blocking other updates)
                    handleUpdate(update);
                }
            }
        } catch (err) {
            if (pollingActive) {
                console.error('[Telegram Poll] Error:', err.message);
                await new Promise(r => setTimeout(r, 3000)); // wait before retry
            }
        }
    }
    console.log('[Telegram] Polling stopped.');
}

// POST /api/telegram/polling/start — start long polling (for localhost)
router.post('/polling/start', async (req, res) => {
    const token = getTelegramToken();
    if (!token) return res.status(400).json({ error: 'No bot token' });

    if (pollingActive) {
        return res.json({ status: 'already_running' });
    }

    // Remove any webhook first (can't use both)
    try {
        await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: '' })
        });
    } catch (e) { }

    pollingActive = true;
    pollLoop(); // Start in background (no await)
    console.log('[Telegram] Long polling started!');
    res.json({ status: 'started', message: 'Bot is now listening via long polling. Send a message to your bot on Telegram!' });
});

// POST /api/telegram/polling/stop — stop long polling
router.post('/polling/stop', async (req, res) => {
    pollingActive = false;
    res.json({ status: 'stopped' });
});

// GET /api/telegram/polling/status — check if polling is active
router.get('/polling/status', (req, res) => {
    res.json({ active: pollingActive });
});

export default router;
