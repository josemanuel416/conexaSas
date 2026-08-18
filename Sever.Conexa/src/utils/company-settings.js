/** Definiciones de variables del sistema (metadata en código, valores en BD) */
export const SYSTEM_VARIABLE_DEFS = [
  {
    key: 'services.code_prefix',
    label: 'Prefijo código de servicios',
    description: 'Genera códigos automáticos: prefijo + 4 dígitos (ej. SRV0001).',
    defaultValue: 'SRV',
    sortOrder: 10,
  },
  {
    key: 'inventory.internal_lot_prefix',
    label: 'Prefijo lote interno',
    description: 'Genera lotes internos automáticos: prefijo + consecutivo (ej. LT000001).',
    defaultValue: 'LT',
    sortOrder: 20,
  },
  {
    key: 'inventory.valuation_method',
    label: 'Método de valorización',
    description: 'average = costo promedio del artículo; purchase = precio de compra en existencia.',
    defaultValue: 'average',
    sortOrder: 21,
  },
  {
    key: 'inventory.articles.code_prefix',
    label: 'Prefijo código de artículos',
    description: 'Prefijo para códigos automáticos de artículos (ej. ART0001).',
    defaultValue: 'ART',
    sortOrder: 22,
  },
];

export const SERVICE_CODE_PAD = 4;

export function normalizeServicePrefix(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function validateServicePrefix(prefix) {
  const p = normalizeServicePrefix(prefix);
  if (p.length < 2 || p.length > 8) {
    throw Object.assign(new Error('El prefijo debe tener entre 2 y 8 caracteres alfanuméricos'), {
      status: 400,
    });
  }
  return p;
}

export async function ensureCompanyVariables(db, companyId) {
  for (const def of SYSTEM_VARIABLE_DEFS) {
    await db.query(
      `INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (company_id, var_key) DO NOTHING`,
      [companyId, def.key, def.defaultValue, def.label, def.description, def.sortOrder]
    );
  }
}

export async function listCompanyVariables(db, companyId) {
  await ensureCompanyVariables(db, companyId);
  const { rows } = await db.query(
    `SELECT var_key, var_value, label, description, sort_order, is_editable, updated_at
     FROM company_system_variables
     WHERE company_id = $1
     ORDER BY sort_order, label`,
    [companyId]
  );
  return rows.map((r) => ({
    key: r.var_key,
    value: r.var_value,
    label: r.label,
    description: r.description,
    sortOrder: r.sort_order,
    isEditable: r.is_editable,
    updatedAt: r.updated_at,
  }));
}

export async function getCompanyVariable(db, companyId, key) {
  await ensureCompanyVariables(db, companyId);
  const { rows } = await db.query(
    `SELECT var_value FROM company_system_variables WHERE company_id = $1 AND var_key = $2`,
    [companyId, key]
  );
  if (!rows[0]) {
    const def = SYSTEM_VARIABLE_DEFS.find((d) => d.key === key);
    return def?.defaultValue ?? null;
  }
  return rows[0].var_value;
}

export async function setCompanyVariable(db, companyId, key, value) {
  await ensureCompanyVariables(db, companyId);
  let normalized = String(value ?? '').trim();

  if (key === 'services.code_prefix') {
    normalized = validateServicePrefix(normalized);
  }
  if (key === 'inventory.valuation_method') {
    const v = String(value || '').trim().toLowerCase();
    if (!['average', 'purchase'].includes(v)) {
      throw Object.assign(new Error('Valor debe ser average o purchase'), { status: 400 });
    }
    normalized = v;
  }
  if (key === 'inventory.internal_lot_prefix' || key === 'inventory.articles.code_prefix') {
    normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (normalized.length < 2) {
      throw Object.assign(new Error('El prefijo debe tener entre 2 y 8 caracteres'), { status: 400 });
    }
  }

  const { rows } = await db.query(
    `UPDATE company_system_variables
     SET var_value = $1, updated_at = NOW()
     WHERE company_id = $2 AND var_key = $3 AND is_editable = true
     RETURNING var_key, var_value, label, description, sort_order, is_editable, updated_at`,
    [normalized, companyId, key]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Variable no encontrada o no editable'), { status: 404 });
  }
  return {
    key: rows[0].var_key,
    value: rows[0].var_value,
    label: rows[0].label,
    description: rows[0].description,
    sortOrder: rows[0].sort_order,
    isEditable: rows[0].is_editable,
    updatedAt: rows[0].updated_at,
  };
}

export async function peekNextServiceCode(db, companyId) {
  const prefix = validateServicePrefix(
    (await getCompanyVariable(db, companyId, 'services.code_prefix')) || 'SRV'
  );
  const pattern = `^${prefix}[0-9]{${SERVICE_CODE_PAD}}$`;
  const { rows } = await db.query(
    `SELECT code FROM services
     WHERE company_id = $1 AND code ~ $2
     ORDER BY code DESC LIMIT 1`,
    [companyId, pattern]
  );
  let next = 1;
  if (rows[0]) {
    next = parseInt(rows[0].code.slice(prefix.length), 10) + 1;
  }
  if (next > 10 ** SERVICE_CODE_PAD - 1) {
    throw Object.assign(new Error('Consecutivo de servicios agotado para este prefijo'), { status: 400 });
  }
  return {
    prefix,
    nextCode: `${prefix}${String(next).padStart(SERVICE_CODE_PAD, '0')}`,
    nextNumber: next,
  };
}