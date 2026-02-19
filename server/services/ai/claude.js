import Anthropic from '@anthropic-ai/sdk';

export class ClaudeProvider {
    constructor() {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    async *streamChat(userMessage, systemPrompt) {
        const stream = await this.client.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }]
        });

        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield event.delta.text;
            }
        }
    }
}
