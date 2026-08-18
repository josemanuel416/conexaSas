export function formatService(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    basePrice: Number(row.base_price),
    durationMinutes: row.duration_minutes,
    isActive: row.is_active,
  };
}

export async function findDuplicateService(db, companyId, description, excludeId = null) {
  const normalized = String(description || '').trim();
  if (!normalized) return null;

  const values = [companyId, normalized.toLowerCase()];
  let sql = `SELECT id, code, description FROM services
             WHERE company_id = $1 AND LOWER(TRIM(description)) = $2`;
  if (excludeId) {
    values.push(excludeId);
    sql += ` AND id != $${values.length}`;
  }
  sql += ' LIMIT 1';

  const { rows } = await db.query(sql, values);
  return rows[0] || null;
}

export async function assertServiceNotDuplicate(db, companyId, description, excludeId = null) {
  const duplicate = await findDuplicateService(db, companyId, description, excludeId);
  if (duplicate) {
    throw Object.assign(
      new Error(`Ya existe un servicio con la descripción "${duplicate.description}" (${duplicate.code})`),
      { status: 409 },
    );
  }
}
