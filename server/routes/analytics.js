import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { Document, ChatSession } from '../models/index.js';

const router = Router();

router.get('/', authenticate, enforceTenant, async (req, res) => {
    try {
        const tenantId = req.tenantId;

        let totalDocuments, totalChats, recentDocuments;

        if (process.env.DATABASE_TYPE === 'postgresql') {
            totalDocuments = await Document.count({ where: { tenantId } });
            totalChats = await ChatSession.count({ where: { tenantId } });
            recentDocuments = await Document.findAll({
                where: { tenantId },
                order: [['createdAt', 'DESC']],
                limit: 5
            });
        } else {
            totalDocuments = await Document.countDocuments({ tenantId });
            totalChats = await ChatSession.countDocuments({ tenantId });
            recentDocuments = await Document.find({ tenantId })
                .sort({ createdAt: -1 })
                .limit(5);
        }

        res.json({
            totalDocuments,
            totalChats,
            recentDocuments
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

export default router;
