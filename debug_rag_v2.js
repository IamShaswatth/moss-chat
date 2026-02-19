import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { generateEmbedding } from './server/services/rag/embeddings.js';
import { queryVectors } from './server/services/rag/pinecone.js';

async function main() {
    const query = "what is the shop name";
    const tenantId = "d7d8d436-1b2f-4754-8915-833f215a8999";

    console.log(`Query: "${query}"`);
    const emb = await generateEmbedding(query);
    const results = await queryVectors(emb, tenantId, 5);

    if (!results.matches || results.matches.length === 0) {
        console.log('No matches.');
        process.exit(0);
    }

    console.log(`Total matches: ${results.matches.length}`);
    console.log(`Max Score: ${results.matches[0].score}`);
    console.log('');

    for (let i = 0; i < results.matches.length; i++) {
        const m = results.matches[i];
        console.log(`--- Match ${i} ---`);
        console.log(`Score: ${m.score}`);
        console.log(`ID: ${m.id}`);
        console.log(`Full Text: ${m.metadata.text}`);
        console.log('');
    }

    process.exit(0);
}

main().catch(console.error);
