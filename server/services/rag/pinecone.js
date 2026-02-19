import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
dotenv.config();

let pineconeIndex = null;

function getIndex() {
    if (!pineconeIndex) {
        const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        pineconeIndex = pc.index(process.env.PINECONE_INDEX);
    }
    return pineconeIndex;
}

export async function upsertVectors(vectors, namespace) {
    const index = getIndex();
    const ns = index.namespace(namespace);

    // Batch upsert in groups of 100
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await ns.upsert(batch);
    }
}

export async function queryVectors(embedding, namespace, topK = 5) {
    const index = getIndex();
    const ns = index.namespace(namespace);

    return ns.query({
        vector: embedding,
        topK,
        includeMetadata: true
    });
}

export async function deleteByDocument(documentId, namespace) {
    const index = getIndex();
    const ns = index.namespace(namespace);

    // Delete by ID prefix
    try {
        // Fetch vectors with the document prefix and delete
        const ids = [];
        for (let i = 0; i < 1000; i++) {
            ids.push(`${documentId}-chunk-${i}`);
        }
        // Delete in batches
        const batchSize = 100;
        for (let i = 0; i < ids.length; i += batchSize) {
            try {
                await ns.deleteMany(ids.slice(i, i + batchSize));
            } catch (e) {
                break; // Stop when IDs no longer exist
            }
        }
    } catch (error) {
        console.error('Pinecone delete error:', error);
    }
}
