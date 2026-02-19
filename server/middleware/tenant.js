export function enforceTenant(req, res, next) {
    if (!req.tenantId) {
        return res.status(403).json({ error: 'Tenant context required' });
    }
    next();
}
