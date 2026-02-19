import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

export async function connectDatabase() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

export default mongoose;
