import { Router } from 'express';
import { pool } from '../db/pool.js';
import { CONEXASOFT_COMPANY_THEME } from '../config/conexasoft-brand.js';
import { parseTenantHost } from '../utils/tenant-host.js';

const router = Router();

function formatSiteContent(row) {
  return {
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    mission: row.mission,
    vision: row.vision,
    benefits: row.benefits || [],
    contact: {
      email: row.contact_email,
      phone: row.contact_phone,
      whatsapp: row.contact_whatsapp,
      address: row.contact_address,
    },
  };
}

function formatPlan(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    priceMonthly: Number(row.price_monthly),
    priceYearly: row.price_yearly != null ? Number(row.price_yearly) : null,
    currency: row.currency,
    features: row.features || [],
    moduleCodes: row.module_codes || [],
    isFeatured: row.is_featured,
  };
}

function formatPublicCompany(row) {
  return {
    name: row.name,
    slug: row.slug,
    theme: {
      primary: row.theme_primary || CONEXASOFT_COMPANY_THEME.primary,
      secondary: row.theme_secondary || CONEXASOFT_COMPANY_THEME.secondary,
      accent: row.theme_accent || CONEXASOFT_COMPANY_THEME.accent,
    },
  };
}

router.get('/host', async (req, res) => {
  const parsed = parseTenantHost(req.headers.host);
  if (parsed.kind !== 'tenant') {
    return res.json({ kind: parsed.kind, slug: null, company: null });
  }
  const { rows } = await pool.query(
    `SELECT name, slug, theme_primary, theme_secondary, theme_accent
     FROM companies WHERE slug = $1 AND is_active = true`,
    [parsed.slug],
  );
  if (!rows[0]) {
    return res.status(404).json({ kind: 'tenant', slug: parsed.slug, error: 'Empresa no encontrada' });
  }
  res.json({ kind: 'tenant', slug: parsed.slug, company: formatPublicCompany(rows[0]) });
});

router.get('/companies/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'Identificador de empresa inválido' });
  }
  const { rows } = await pool.query(
    `SELECT name, slug, theme_primary, theme_secondary, theme_accent
     FROM companies WHERE slug = $1 AND is_active = true`,
    [slug],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
  res.json(formatPublicCompany(rows[0]));
});

router.get('/site', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM site_content WHERE id = 1');
  if (!rows[0]) return res.status(404).json({ error: 'Contenido del sitio no configurado' });
  res.json(formatSiteContent(rows[0]));
});

router.get('/plans', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order, name`,
  );
  res.json(rows.map(formatPlan));
});

router.post('/contact', async (req, res) => {
  const { fullName, email, phone, companyName, message } = req.body;
  if (!fullName?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Nombre, email y mensaje son requeridos' });
  }
  const { rows } = await pool.query(
    `INSERT INTO public_contact_messages (full_name, email, phone, company_name, message)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      fullName.trim(),
      email.trim(),
      phone?.trim() || null,
      companyName?.trim() || null,
      message.trim(),
    ],
  );
  res.status(201).json({ ok: true, id: rows[0].id, message: 'Mensaje enviado. Nos contactaremos pronto.' });
});

export default router;
