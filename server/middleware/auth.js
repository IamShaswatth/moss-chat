import jwt from 'jsonwebtoken';

export function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        req.tenantId = decoded.tenantId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, tenantId: user.tenantId, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}
