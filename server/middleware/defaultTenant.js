// Single-tenant middleware: injects a fixed tenantId from environment
// No JWT authentication required — suitable for private/internal deployments

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default-tenant';

export function injectTenant(req, res, next) {
    req.tenantId = DEFAULT_TENANT_ID;
    req.user = { email: 'admin', tenantId: DEFAULT_TENANT_ID, role: 'admin' };
    next();
}
