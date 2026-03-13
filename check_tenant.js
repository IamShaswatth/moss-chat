import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function main() {
    await mongoose.connect(process.env.DATABASE_URL);
    const db = mongoose.connection.db;

    console.log(`\nChecking ALL sessions updated in the last 1 hour...`);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const sessions = await db.collection('chatsessions')
        .find({ updatedAt: { $gt: oneHourAgo } })
        .sort({ updatedAt: -1 })
        .toArray();

    if (sessions.length === 0) {
        console.log('NO RECENT SESSIONS FOUND.');
    } else {
        sessions.forEach(s => {
            console.log(`Tenant: ${s.tenantId}`);
            console.log(`Session: ${s.sessionId}`);
            console.log(`Updated: ${s.updatedAt}`);
            console.log(`Messages: ${s.messages ? s.messages.length : 0}`);
            if (s.messages && s.messages.length > 0) {
                const lastMsg = s.messages[s.messages.length - 1];
                console.log(`Last Msg (${lastMsg.role}): ${lastMsg.content.substring(0, 50)}...`);
            }
            console.log('---');
        });
    }

    process.exit(0);
}
main();
