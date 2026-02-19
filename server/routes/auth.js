import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/index.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

// Register new tenant + admin
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const existing = await findUserByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const tenantId = uuidv4();

        const user = await createUser({
            email,
            password: hashedPassword,
            tenantId,
            role: 'admin'
        });

        const token = generateToken({
            id: user.id || user._id,
            email: user.email,
            tenantId: user.tenantId,
            role: user.role
        });

        res.status(201).json({ token, user: { id: user.id || user._id, email: user.email, tenantId } });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken({
            id: user.id || user._id,
            email: user.email,
            tenantId: user.tenantId,
            role: user.role
        });

        res.json({ token, user: { id: user.id || user._id, email: user.email, tenantId: user.tenantId } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// DB-agnostic helpers
async function findUserByEmail(email) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return User.findOne({ where: { email } });
    }
    return User.findOne({ email });
}

async function createUser(data) {
    if (process.env.DATABASE_TYPE === 'postgresql') {
        return User.create(data);
    }
    return new User(data).save();
}

export default router;
