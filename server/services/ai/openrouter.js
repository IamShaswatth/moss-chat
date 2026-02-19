import OpenAI from 'openai';

export class OpenRouterProvider {
    constructor() {
        this.client = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY
        });
    }

    async *streamChat(userMessage, systemPrompt) {
        const stream = await this.client.chat.completions.create({
            model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
            stream: true,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: 1024
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }
}
