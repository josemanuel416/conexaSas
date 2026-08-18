import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { normalizeEmail, normalizePassword } from '../utils/normalize.js';
import { CONEXASOFT_COMPANY_THEME } from '../config/conexasoft-brand.js';

export async function loginCompany(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = normalizePassword(req.body.password);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.company_id,
            u.cash_register_id,
            c.name AS company_name, c.slug AS company_slug, c.is_active AS company_active,
            c.theme_primary, c.theme_secondary, c.theme_accent
     FROM users u
     JOIN companies c ON c.id = u.company_id
     WHERE u.email = $1 AND u.role != 'super_admin' AND u.is_active = true`,
    [email]
  );

  const companySlug =
    typeof req.body.companySlug === 'string' ? req.body.companySlug.trim().toLowerCase() : '';

  const activeRows = rows.filter((row) => row.company_active);

  let candidates = activeRows;
  if (companySlug) {
    candidates = activeRows.filter((row) => row.company_slug === companySlug);
    if (candidates.length === 0) {
      return res.status(400).json({
        error: 'Identificador de empresa incorrecto',
        hint: 'Use el código de la empresa (slug), no el nombre del administrador. Ejemplo: connetc-group-sas',
        companies: activeRows.map((m) => ({
          name: m.company_name,
          slug: m.company_slug,
        })),
      });
    }
  }

  const matches = [];
  for (const row of candidates) {
    if (await bcrypt.compare(password, row.password_hash)) {
      matches.push(row);
    }
  }

  if (matches.length === 0) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  if (matches.length > 1) {
    return res.status(409).json({
      error: 'Este email existe en varias compañías. Indique el identificador de su empresa.',
      companies: matches.map((m) => ({
        name: m.company_name,
        slug: m.company_slug,
      })),
    });
  }

  const user = matches[0];

  await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

  const modules = await pool.query(
    `SELECT m.code, m.name, m.icon
     FROM company_modules cm
     JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = $1 AND cm.is_enabled = true AND m.is_active = true
     ORDER BY m.sort_order`,
    [user.company_id]
  );

  const perms = await pool.query(
    `SELECT p.code FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = $1 AND up.company_id = $2 AND p.is_active = true`,
    [user.id, user.company_id]
  );

  const permissionCodes = user.role === 'company_admin'
    ? ['*']
    : perms.rows.map((r) => r.code);

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyId: user.company_id,
    permissions: permissionCodes,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      companyId: user.company_id,
      companyName: user.company_name,
      companySlug: user.company_slug,
      cashRegisterId: user.cash_register_id || null,
    },
    theme: formatTheme(user),
    modules: modules.rows,
    permissions: permissionCodes,
  });
}

function formatTheme(row) {
  return {
    primary: row.theme_primary || CONEXASOFT_COMPANY_THEME.primary,
    secondary: row.theme_secondary || CONEXASOFT_COMPANY_THEME.secondary,
    accent: row.theme_accent || CONEXASOFT_COMPANY_THEME.accent,
  };
}

export async function getCompanyDashboard(req, res) {
  const companyId = req.user.companyId;

  const [company, modules, userCount] = await Promise.all([
    pool.query(`SELECT * FROM companies WHERE id = $1`, [companyId]),
    pool.query(
      `SELECT m.code, m.name, m.description, m.icon
       FROM company_modules cm
       JOIN modules m ON m.id = cm.module_id
       WHERE cm.company_id = $1 AND cm.is_enabled = true
       ORDER BY m.sort_order`,
      [companyId]
    ),
    pool.query(
      `SELECT COUNT(*) AS count FROM users WHERE company_id = $1 AND is_active = true`,
      [companyId]
    ),
  ]);

  if (!company.rows[0]) {
    return res.status(404).json({ error: 'Compañía no encontrada' });
  }

  const c = company.rows[0];
  res.json({
    company: {
      id: c.id,
      name: c.name,
      nit: c.nit,
      slug: c.slug,
    },
    theme: {
      primary: c.theme_primary || CONEXASOFT_COMPANY_THEME.primary,
      secondary: c.theme_secondary || CONEXASOFT_COMPANY_THEME.secondary,
      accent: c.theme_accent || CONEXASOFT_COMPANY_THEME.accent,
    },
    modules: modules.rows,
    stats: {
      users: Number(userCount.rows[0].count),
      modules: modules.rows.length,
    },
  });
}
