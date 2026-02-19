import dotenv from 'dotenv';
dotenv.config();

import { generateEmbedding } from './server/services/rag/embeddings.js';
import { queryVectors } from './server/services/rag/pinecone.js';

async function main() {
    const query = "how many members are working in salon";
    const tenantId = "d7d8d436-1b2f-4754-8915-833f215a8999"; // From your widget test.html

    console.log(`Querying: "${query}"`);
    console.log(`Tenant ID: ${tenantId}`);

    try {
        const queryEmbedding = await generateEmbedding(query);
        const results = await queryVectors(queryEmbedding, tenantId, 5);

        console.log('\n--- Matches ---');
        if (results.matches && results.matches.length > 0) {
            results.matches.forEach((m, i) => {
                console.log(`[${i}] Score: ${m.score.toFixed(4)} | Text: ${m.metadata.text.substring(0, 50)}...`);
            });
        } else {
            console.log('No matches found.');
        }

        const maxScore = results.matches?.length > 0 ? results.matches[0].score : 0;
        console.log(`\nMax Score: ${maxScore}`);

        if (maxScore >= 0.20 && maxScore < 0.65) {
            console.log("✅ Would be captured as suggestion (0.20 - 0.65)");
        } else if (maxScore >= 0.65) {
            console.log("❌ Too high score (Assumed Answered)");
        } else {
            console.log("❌ Too low score (Assumed Irrelevant)");
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

main();
