import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { parseTenantHost } from '../utils/tenant-host.js';

export function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acceso solo para administradores' });
  }
  next();
}

export async function requireMatchingTenantHost(req, res, next) {
  const parsed = parseTenantHost(req.headers.host);
  if (parsed.kind !== 'tenant') return next();

  try {
    const { rows } = await pool.query(
      'SELECT id FROM companies WHERE slug = $1 AND is_active = true',
      [parsed.slug],
    );
    if (!rows[0] || rows[0].id !== req.user?.companyId) {
      return res.status(403).json({ error: 'Esta dirección pertenece a otra empresa' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireCompanyUser(req, res, next) {
  if (!req.user?.companyId) {
    return res.status(403).json({ error: 'Acceso solo para usuarios de compañía' });
  }
  next();
}

export function requireCompanyAdmin(req, res, next) {
  if (!req.user?.companyId) {
    return res.status(403).json({ error: 'Acceso solo para usuarios de compañía' });
  }
  if (req.user.role !== 'company_admin') {
    return res.status(403).json({ error: 'Acceso solo para administradores de la compañía' });
  }
  next();
}
