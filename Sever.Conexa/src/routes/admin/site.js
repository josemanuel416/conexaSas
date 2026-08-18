import { pool } from '../../db/pool.js';

function formatSiteContent(row) {
  return {
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    mission: row.mission,
    vision: row.vision,
    benefits: row.benefits || [],
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactWhatsapp: row.contact_whatsapp,
    contactAddress: row.contact_address,
    updatedAt: row.updated_at,
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
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatContactMessage(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    companyName: row.company_name,
    message: row.message,
    status: row.status,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
  };
}

export async function getSiteContent(_req, res) {
  const { rows } = await pool.query('SELECT * FROM site_content WHERE id = 1');
  if (!rows[0]) return res.status(404).json({ error: 'Contenido no encontrado' });
  res.json(formatSiteContent(rows[0]));
}

export async function updateSiteContent(req, res) {
  const {
    heroTitle, heroSubtitle, mission, vision, benefits,
    contactEmail, contactPhone, contactWhatsapp, contactAddress,
  } = req.body;

  const { rows } = await pool.query(
    `UPDATE site_content SET
       hero_title = COALESCE($1, hero_title),
       hero_subtitle = COALESCE($2, hero_subtitle),
       mission = COALESCE($3, mission),
       vision = COALESCE($4, vision),
       benefits = COALESCE($5, benefits),
       contact_email = COALESCE($6, contact_email),
       contact_phone = COALESCE($7, contact_phone),
       contact_whatsapp = COALESCE($8, contact_whatsapp),
       contact_address = COALESCE($9, contact_address),
       updated_at = NOW()
     WHERE id = 1
     RETURNING *`,
    [
      heroTitle?.trim() || null,
      heroSubtitle?.trim() || null,
      mission?.trim() || null,
      vision?.trim() || null,
      benefits ? JSON.stringify(benefits) : null,
      contactEmail?.trim() || null,
      contactPhone?.trim() || null,
      contactWhatsapp?.trim() || null,
      contactAddress?.trim() || null,
    ],
  );
  res.json(formatSiteContent(rows[0]));
}

export async function listPlans(_req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM subscription_plans ORDER BY sort_order, name',
  );
  res.json(rows.map(formatPlan));
}

export async function createPlan(req, res) {
  const {
    name, slug, description, priceMonthly, priceYearly, currency,
    features, moduleCodes, isFeatured, isActive, sortOrder,
  } = req.body;
  if (!name?.trim() || !slug?.trim()) {
    return res.status(400).json({ error: 'Nombre y slug son requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO subscription_plans (
         name, slug, description, price_monthly, price_yearly, currency,
         features, module_codes, is_featured, is_active, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        name.trim(),
        slug.trim().toLowerCase(),
        description?.trim() || null,
        Number(priceMonthly) || 0,
        priceYearly != null ? Number(priceYearly) : null,
        currency || 'COP',
        JSON.stringify(features || []),
        moduleCodes || [],
        !!isFeatured,
        isActive !== false,
        Number(sortOrder) || 0,
      ],
    );
    res.status(201).json(formatPlan(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El slug ya existe' });
    throw err;
  }
}

export async function updatePlan(req, res) {
  const {
    name, slug, description, priceMonthly, priceYearly, currency,
    features, moduleCodes, isFeatured, isActive, sortOrder,
  } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE subscription_plans SET
         name = COALESCE($1, name),
         slug = COALESCE($2, slug),
         description = COALESCE($3, description),
         price_monthly = COALESCE($4, price_monthly),
         price_yearly = $5,
         currency = COALESCE($6, currency),
         features = COALESCE($7, features),
         module_codes = COALESCE($8, module_codes),
         is_featured = COALESCE($9, is_featured),
         is_active = COALESCE($10, is_active),
         sort_order = COALESCE($11, sort_order),
         updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [
        name?.trim() || null,
        slug?.trim()?.toLowerCase() || null,
        description?.trim() || null,
        priceMonthly != null ? Number(priceMonthly) : null,
        priceYearly != null ? Number(priceYearly) : null,
        currency || null,
        features ? JSON.stringify(features) : null,
        moduleCodes || null,
        isFeatured != null ? !!isFeatured : null,
        isActive != null ? !!isActive : null,
        sortOrder != null ? Number(sortOrder) : null,
        req.params.id,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plan no encontrado' });
    res.json(formatPlan(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El slug ya existe' });
    throw err;
  }
}

export async function listContactMessages(_req, res) {
  const { rows } = await pool.query(
    'SELECT * FROM public_contact_messages ORDER BY created_at DESC LIMIT 500',
  );
  res.json(rows.map(formatContactMessage));
}

export async function updateContactMessage(req, res) {
  const { status, adminNotes } = req.body;
  const { rows } = await pool.query(
    `UPDATE public_contact_messages SET
       status = COALESCE($1, status),
       admin_notes = COALESCE($2, admin_notes)
     WHERE id = $3 RETURNING *`,
    [status || null, adminNotes?.trim() || null, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Mensaje no encontrado' });
  res.json(formatContactMessage(rows[0]));
}
