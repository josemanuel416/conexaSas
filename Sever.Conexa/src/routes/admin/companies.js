import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { pool } from '../../db/pool.js';
import { normalizeEmail, normalizePassword } from '../../utils/normalize.js';
import { PROJECT_ROOT, resolveProjectPath } from '../../project-root.js';
import { CONEXASOFT_COMPANY_THEME } from '../../config/conexasoft-brand.js';

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpeg|webp)$/.test(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Solo se permiten imágenes PNG, JPG o WebP'));
  },
});

export const uploadCompanyLogoMiddleware = logoUpload.single('logo');

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeInvoiceTemplate(value) {
  const allowed = ['standard'];
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.includes(v) ? v : 'standard';
}

function normalizeLogoPath(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeTheme(theme) {
  const hex = /^#[0-9A-Fa-f]{6}$/;
  return {
    primary: theme?.primary && hex.test(theme.primary) ? theme.primary : CONEXASOFT_COMPANY_THEME.primary,
    secondary: theme?.secondary && hex.test(theme.secondary) ? theme.secondary : CONEXASOFT_COMPANY_THEME.secondary,
    accent: theme?.accent && hex.test(theme.accent) ? theme.accent : CONEXASOFT_COMPANY_THEME.accent,
  };
}

export async function listCompanies(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count,
       (SELECT COUNT(*) FROM company_modules cm WHERE cm.company_id = c.id AND cm.is_enabled) AS module_count
     FROM companies c
     ORDER BY c.created_at DESC`
  );

  res.json(rows.map(formatCompany));
}

export async function getCompany(req, res) {
  const { rows } = await pool.query(`SELECT * FROM companies WHERE id = $1`, [
    req.params.id,
  ]);

  if (!rows[0]) {
    return res.status(404).json({ error: 'Compañía no encontrada' });
  }

  const [modules, adminResult] = await Promise.all([
    pool.query(
      `SELECT m.id, m.code, m.name, m.description, m.icon,
              COALESCE(cm.is_enabled, false) AS is_enabled,
              cm.contract_start, cm.contract_end
       FROM modules m
       LEFT JOIN company_modules cm ON cm.module_id = m.id AND cm.company_id = $1
       WHERE m.is_active = true
       ORDER BY m.sort_order`,
      [req.params.id]
    ),
    pool.query(
      `SELECT id, email, full_name, is_active, last_login
       FROM users
       WHERE company_id = $1 AND role = 'company_admin'
       ORDER BY created_at ASC
       LIMIT 1`,
      [req.params.id]
    ),
  ]);

  const admin = adminResult.rows[0]
    ? {
        id: adminResult.rows[0].id,
        email: adminResult.rows[0].email,
        fullName: adminResult.rows[0].full_name,
        isActive: adminResult.rows[0].is_active,
        lastLogin: adminResult.rows[0].last_login,
      }
    : null;

  res.json({ ...formatCompany(rows[0]), modules: modules.rows, admin });
}

export async function createCompany(req, res) {
  const { name, nit, email, phone, address, modules, logoPath, invoiceTemplate } = req.body;
  const adminEmail = normalizeEmail(req.body.adminEmail);
  const adminPassword = normalizePassword(req.body.adminPassword);
  const adminName = typeof req.body.adminName === 'string' ? req.body.adminName.trim() : '';

  if (!name || !nit || !adminEmail || !adminPassword || !adminName) {
    return res.status(400).json({
      error: 'Nombre, NIT, email admin, contraseña admin y nombre admin son requeridos',
    });
  }

  if (adminPassword.length < 6) {
    return res.status(400).json({ error: 'La contraseña admin debe tener mínimo 6 caracteres' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const slug = slugify(name);
    const theme = normalizeTheme(req.body.theme);
    const { rows: companyRows } = await client.query(
      `INSERT INTO companies (name, nit, slug, email, phone, address, theme_primary, theme_secondary, theme_accent, logo_path, invoice_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        name,
        nit,
        slug,
        email || null,
        phone || null,
        address || null,
        theme.primary,
        theme.secondary,
        theme.accent,
        normalizeLogoPath(logoPath),
        normalizeInvoiceTemplate(invoiceTemplate),
      ]
    );
    const company = companyRows[0];

    const hash = await bcrypt.hash(adminPassword, 12);
    await client.query(
      `INSERT INTO users (company_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'company_admin')`,
      [company.id, adminEmail, hash, adminName]
    );

    if (Array.isArray(modules) && modules.length > 0) {
      for (const moduleId of modules) {
        await client.query(
          `INSERT INTO company_modules (company_id, module_id, is_enabled)
           VALUES ($1, $2, true)`,
          [company.id, moduleId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(formatCompany(company));
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505') {
      return res.status(409).json({ error: 'NIT, slug o email ya registrado' });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCompany(req, res) {
  const {
    name,
    nit,
    email,
    phone,
    address,
    isActive,
    adminName,
    adminEmail,
    adminPassword,
    adminIsActive,
    theme,
    logoPath,
    invoiceTemplate,
  } = req.body;

  const slug = name ? slugify(name) : null;
  const themeColors = theme ? normalizeTheme(theme) : null;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE companies
       SET name = COALESCE($1, name),
           nit = COALESCE($2, nit),
           slug = COALESCE($3, slug),
           email = COALESCE($4, email),
           phone = COALESCE($5, phone),
           address = COALESCE($6, address),
           is_active = COALESCE($7, is_active),
           theme_primary = COALESCE($8, theme_primary),
           theme_secondary = COALESCE($9, theme_secondary),
           theme_accent = COALESCE($10, theme_accent),
           logo_path = COALESCE($11, logo_path),
           invoice_template = COALESCE($12, invoice_template),
           updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        name,
        nit,
        slug,
        email,
        phone,
        address,
        isActive,
        themeColors?.primary,
        themeColors?.secondary,
        themeColors?.accent,
        logoPath !== undefined ? normalizeLogoPath(logoPath) : null,
        invoiceTemplate !== undefined ? normalizeInvoiceTemplate(invoiceTemplate) : null,
        req.params.id,
      ]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Compañía no encontrada' });
    }

    if (adminEmail || adminName || adminPassword || adminIsActive !== undefined) {
      const normalizedAdminEmail =
        adminEmail !== undefined ? normalizeEmail(adminEmail) : undefined;
      const normalizedAdminPassword =
        adminPassword !== undefined && adminPassword !== null && adminPassword !== ''
          ? normalizePassword(adminPassword)
          : null;
      const normalizedAdminName =
        typeof adminName === 'string' ? adminName.trim() : undefined;

      const { rows: adminRows } = await client.query(
        `SELECT id FROM users
         WHERE company_id = $1 AND role = 'company_admin'
         ORDER BY created_at ASC LIMIT 1`,
        [req.params.id]
      );

      if (adminRows[0]) {
        const updates = [];
        const values = [];
        let i = 1;

        if (normalizedAdminName) {
          updates.push(`full_name = $${i++}`);
          values.push(normalizedAdminName);
        }
        if (normalizedAdminEmail) {
          updates.push(`email = $${i++}`);
          values.push(normalizedAdminEmail);
        }
        if (normalizedAdminPassword) {
          if (normalizedAdminPassword.length < 6) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'La contraseña admin debe tener mínimo 6 caracteres' });
          }
          const hash = await bcrypt.hash(normalizedAdminPassword, 12);
          updates.push(`password_hash = $${i++}`);
          values.push(hash);
        }
        if (adminIsActive !== undefined) {
          updates.push(`is_active = $${i++}`);
          values.push(adminIsActive);
        }

        if (updates.length > 0) {
          updates.push('updated_at = NOW()');
          values.push(adminRows[0].id);
          await client.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`,
            values
          );
        }
      } else if (normalizedAdminEmail && normalizedAdminName && normalizedAdminPassword) {
        if (normalizedAdminPassword.length < 6) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'La contraseña admin debe tener mínimo 6 caracteres' });
        }
        const hash = await bcrypt.hash(normalizedAdminPassword, 12);
        await client.query(
          `INSERT INTO users (company_id, email, password_hash, full_name, role, is_active)
           VALUES ($1, $2, $3, $4, 'company_admin', $5)`,
          [
            req.params.id,
            normalizedAdminEmail,
            hash,
            normalizedAdminName,
            adminIsActive ?? true,
          ]
        );
      } else if (normalizedAdminEmail || normalizedAdminName) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'Para crear el admin de la compañía se requiere nombre, email y contraseña',
        });
      }
    }

    await client.query('COMMIT');
    res.json(formatCompany(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505') {
      return res.status(409).json({ error: 'NIT, slug o email del admin ya registrado' });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCompanyModules(req, res) {
  const { modules } = req.body;

  if (!Array.isArray(modules)) {
    return res.status(400).json({ error: 'Se requiere un array de módulos' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const mod of modules) {
      await client.query(
        `INSERT INTO company_modules (company_id, module_id, is_enabled, contract_start, contract_end)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, module_id)
         DO UPDATE SET is_enabled = $3, contract_start = $4, contract_end = $5, updated_at = NOW()`,
        [
          req.params.id,
          mod.moduleId,
          mod.isEnabled ?? true,
          mod.contractStart || null,
          mod.contractEnd || null,
        ]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Módulos actualizados' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function uploadCompanyLogo(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Archivo logo requerido' });
  }

  const companyId = req.params.id;
  const ext = req.file.mimetype === 'image/png'
    ? 'png'
    : req.file.mimetype === 'image/webp'
      ? 'webp'
      : 'jpg';
  const dir = path.join(PROJECT_ROOT, 'assets', 'companies', companyId);
  fs.mkdirSync(dir, { recursive: true });

  for (const oldExt of ['png', 'jpg', 'jpeg', 'webp']) {
    const oldPath = path.join(dir, `logo.${oldExt}`);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const absolutePath = path.join(dir, `logo.${ext}`);
  fs.writeFileSync(absolutePath, req.file.buffer);
  const logoPath = `assets/companies/${companyId}/logo.${ext}`;

  const { rows } = await pool.query(
    `UPDATE companies SET logo_path = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [logoPath, companyId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Compañía no encontrada' });
  }

  res.json(formatCompany(rows[0]));
}

function resolveCompanyLogoAbsolute(logoPath) {
  const candidate = resolveProjectPath(logoPath);
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

function logoMimeType(absolutePath) {
  const ext = path.extname(absolutePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function getCompanyLogo(req, res) {
  const { rows } = await pool.query(
    'SELECT logo_path FROM companies WHERE id = $1',
    [req.params.id]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Compañía no encontrada' });
  }

  const absolutePath = resolveCompanyLogoAbsolute(rows[0].logo_path);
  if (!absolutePath) {
    return res.status(404).json({ error: 'Logo no encontrado en el servidor' });
  }

  res.setHeader('Content-Type', logoMimeType(absolutePath));
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.sendFile(absolutePath);
}

export async function listModules(req, res) {
  const { rows } = await pool.query(
    `SELECT id, code, name, description, icon, sort_order
     FROM modules WHERE is_active = true ORDER BY sort_order`
  );
  res.json(rows);
}

function formatCompany(c) {
  return {
    id: c.id,
    name: c.name,
    nit: c.nit,
    slug: c.slug,
    email: c.email,
    phone: c.phone,
    address: c.address,
    isActive: c.is_active,
    theme: {
      primary: c.theme_primary || CONEXASOFT_COMPANY_THEME.primary,
      secondary: c.theme_secondary || CONEXASOFT_COMPANY_THEME.secondary,
      accent: c.theme_accent || CONEXASOFT_COMPANY_THEME.accent,
    },
    logoPath: c.logo_path || null,
    invoiceTemplate: c.invoice_template || 'standard',
    userCount: Number(c.user_count) || undefined,
    moduleCount: Number(c.module_count) || undefined,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}
