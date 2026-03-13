import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase } from './config/database.js';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import chatRoutes from './routes/chat.js';
import analyticsRoutes from './routes/analytics.js';
import productRoutes from './routes/products.js';
import telegramRoutes from './routes/telegram.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files for widget
app.use('/widget', express.static('widget'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/products', productRoutes);
app.use('/api/telegram', telegramRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function start() {
    await connectDatabase();

    const server = app.listen(PORT, () => {
        console.log(`\n🌿 Moss Chat server running on http://localhost:${PORT}`);
        console.log(`   Admin panel: http://localhost:5173`);
        console.log(`   Feature: Unanswered Questions Tracking Active`);
        console.log(`   Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? 'Bot configured ✓' : 'No token (set TELEGRAM_BOT_TOKEN in .env)'}\n`);
    });

    server.on('error', async (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  Port ${PORT} is busy. Killing existing process...`);
            const { exec } = await import('child_process');
            const cmd = process.platform === 'win32'
                ? `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %a`
                : `lsof -ti:${PORT} | xargs kill -9`;
            exec(cmd, (error) => {
                if (error) console.log('   Could not auto-kill. Run: taskkill /F /IM node.exe');
                setTimeout(() => {
                    console.log('   Retrying...');
                    app.listen(PORT, () => {
                        console.log(`\n🌿 Moss Chat server running on http://localhost:${PORT}\n`);
                    });
                }, 2000);
            });
        } else {
            console.error('Server error:', err);
            process.exit(1);
        }
    });
}

start().catch(console.error);
