const MAX_CHUNK_SIZE = 300;  // ~300 tokens = ~1200 chars — smaller for better semantic matching
const OVERLAP = 75;

// Approximate token count (1 token ≈ 4 chars)
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

export function chunkText(text) {
    // Split by paragraphs first, then by sentences
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks = [];
    let currentChunk = '';
    let chunkIndex = 0;

    for (const para of paragraphs) {
        const sentences = para.match(/[^.!?\n]+[.!?\n]+/g) || [para];

        for (const sentence of sentences) {
            const combined = currentChunk + ' ' + sentence;
            const tokenCount = estimateTokens(combined);

            if (tokenCount > MAX_CHUNK_SIZE && currentChunk.trim().length > 0) {
                // Save current chunk
                chunks.push({
                    text: currentChunk.trim(),
                    index: chunkIndex,
                    tokens: estimateTokens(currentChunk)
                });
                chunkIndex++;

                // Create overlap from end of current chunk
                const words = currentChunk.trim().split(/\s+/);
                const overlapWordCount = Math.min(
                    Math.floor(words.length * 0.2),
                    Math.floor(OVERLAP)
                );
                const overlapText = words.slice(-overlapWordCount).join(' ');

                currentChunk = overlapText + ' ' + sentence;
            } else {
                currentChunk = combined;
            }
        }
    }

    // Save last chunk — accept even very small chunks
    if (currentChunk.trim().length > 20) {
        chunks.push({
            text: currentChunk.trim(),
            index: chunkIndex,
            tokens: estimateTokens(currentChunk)
        });
    }

    // If we still got only 1 chunk, force-split it into ~300 token pieces
    if (chunks.length === 1 && estimateTokens(chunks[0].text) > MAX_CHUNK_SIZE) {
        const bigText = chunks[0].text;
        const sentences = bigText.match(/[^.!?\n]+[.!?\n]+/g) || [bigText];
        chunks.length = 0;
        let current = '';
        let idx = 0;

        for (const s of sentences) {
            if (estimateTokens(current + s) > MAX_CHUNK_SIZE && current.trim().length > 0) {
                chunks.push({ text: current.trim(), index: idx, tokens: estimateTokens(current) });
                idx++;
                current = s;
            } else {
                current += ' ' + s;
            }
        }
        if (current.trim().length > 20) {
            chunks.push({ text: current.trim(), index: idx, tokens: estimateTokens(current) });
        }
    }

    return chunks;
}
