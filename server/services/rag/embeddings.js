import dotenv from 'dotenv';
dotenv.config();

const JINA_API_KEY = process.env.JINA_API_KEY;
const JINA_MODEL = 'jina-embeddings-v3';
const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || '1024');

async function jinaEmbed(input, task = 'retrieval.passage') {
    const response = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JINA_API_KEY}`
        },
        body: JSON.stringify({
            model: JINA_MODEL,
            input: Array.isArray(input) ? input : [input],
            task,
            dimensions: EMBEDDING_DIMENSIONS
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Jina embedding failed: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.data;
}

export async function generateEmbedding(text) {
    const results = await jinaEmbed(text, 'retrieval.query');
    return results[0].embedding;
}

export async function generateEmbeddings(texts) {
    // Batch process in groups of 100
    const batchSize = 100;
    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const results = await jinaEmbed(batch, 'retrieval.passage');
        allEmbeddings.push(...results.map(d => d.embedding));
    }

    return allEmbeddings;
}
