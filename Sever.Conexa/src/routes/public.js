import { Router } from 'express';
import { pool } from '../db/pool.js';

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
