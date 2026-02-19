import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { OpenRouterProvider } from './openrouter.js';

export function getAIProvider() {
    const provider = process.env.AI_PROVIDER;

    if (provider === 'claude') {
        return new ClaudeProvider();
    } else if (provider === 'openai') {
        return new OpenAIProvider();
    } else if (provider === 'openrouter') {
        return new OpenRouterProvider();
    } else {
        throw new Error(`Unknown AI provider: ${provider}`);
    }
}
