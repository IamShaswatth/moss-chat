import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function main() {
    await mongoose.connect(process.env.DATABASE_URL);
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    users.forEach(u => console.log(u.tenantId));
    process.exit(0);
}
main();
