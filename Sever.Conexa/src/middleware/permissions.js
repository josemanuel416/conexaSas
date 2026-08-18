import { pool } from '../db/pool.js';

export async function loadUserPermissions(userId, companyId) {
  const { rows } = await pool.query(
    `SELECT p.code FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = $1 AND up.company_id = $2 AND p.is_active = true`,
    [userId, companyId]
  );
  return rows.map((r) => r.code);
}

export function requirePermission(...codes) {
  return async (req, res, next) => {
    if (req.user.role === 'company_admin') return next();
    if (req.user.permissions?.includes('*')) return next();

    if (!req.user.permissions?.length) {
      req.user.permissions = await loadUserPermissions(req.user.userId, req.user.companyId);
    }

    const hasAny = codes.some((c) => req.user.permissions.includes(c));
    if (!hasAny) {
      return res.status(403).json({ error: 'No tiene permiso para esta acción' });
    }
    next();
  };
}

export async function hasPermission(user, code) {
  if (user.role === 'company_admin') return true;
  if (user.permissions?.includes('*')) return true;
  const perms = user.permissions?.length
    ? user.permissions
    : await loadUserPermissions(user.userId, user.companyId);
  return perms.includes(code);
}
