import OpenAI from 'openai';

export class OpenAIProvider {
    constructor() {
        this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    async *streamChat(userMessage, systemPrompt) {
        const stream = await this.client.chat.completions.create({
            model: 'gpt-4o-mini',
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
