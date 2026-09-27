import { pool } from '../db/pool.js';
import { findAdjustmentNoteConceptByCode } from './dian-adjustment-note-concepts.js';

export function formatCndbcr(row) {
  if (!row) return null;
  const dian = findAdjustmentNoteConceptByCode(row.dian_code);
  return {
    id: row.id,
    concepto: row.concepto,
    descripcion: row.descripcion,
    cuentaConta: row.cuenta_conta,
    cuentaContaCode: row.cuenta_conta_code || null,
    cuentaContaName: row.cuenta_conta_name || null,
    dianCode: row.dian_code,
    dianName: dian?.name || null,
    status: row.status,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CNDCR_SELECT = `
  SELECT c.*,
         aa.code AS cuenta_conta_code,
         aa.name AS cuenta_conta_name
  FROM cndbcr c
  LEFT JOIN accounting_accounts aa ON aa.id = c.cuenta_conta
`;

export async function listCndbcr(companyId, { activeOnly = false } = {}) {
  const values = [companyId];
  let sql = `${CNDCR_SELECT} WHERE c.company_id = $1`;
  if (activeOnly) sql += ` AND c.status = 'activo'`;
  sql += ' ORDER BY c.sort_order, c.concepto';
  const { rows } = await pool.query(sql, values);
  return rows.map(formatCndbcr);
}

export async function loadCndbcr(id, companyId, { activeOnly = false } = {}) {
  const values = [id, companyId];
  let sql = `${CNDCR_SELECT} WHERE c.id = $1 AND c.company_id = $2`;
  if (activeOnly) sql += ` AND c.status = 'activo'`;
  const { rows } = await pool.query(sql, values);
  return formatCndbcr(rows[0]);
}

export function validateCndbcrPayload(body, { isUpdate = false } = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const concepto = has('concepto') ? String(body.concepto || '').trim() : null;
  const descripcion = has('descripcion') ? String(body.descripcion || '').trim() : null;
  const dianCode = has('dianCode') || has('dian_code')
    ? String(body.dianCode || body.dian_code || '').trim()
    : null;
  const status = has('status') ? (body.status === 'inactivo' ? 'inactivo' : 'activo') : null;
  const cuentaConta = has('cuentaConta') || has('cuenta_conta')
    ? (body.cuentaConta || body.cuenta_conta || null)
    : null;
  const sortOrder = has('sortOrder') || has('sort_order')
    ? Number(body.sortOrder ?? body.sort_order ?? 0) || 0
    : null;

  if (!isUpdate || has('concepto')) {
    if (!concepto) throw Object.assign(new Error('El concepto es obligatorio'), { status: 400 });
    if (concepto.length > 20) throw Object.assign(new Error('El concepto no puede superar 20 caracteres'), { status: 400 });
  }
  if (!isUpdate || has('descripcion')) {
    if (!descripcion) throw Object.assign(new Error('La descripción es obligatoria'), { status: 400 });
  }
  if (!isUpdate || has('dianCode') || has('dian_code')) {
    if (!findAdjustmentNoteConceptByCode(dianCode)) {
      throw Object.assign(new Error('Seleccione un código DIAN válido (1-5)'), { status: 400 });
    }
  }

  return { concepto, descripcion, dianCode, status, cuentaConta, sortOrder };
}

export async function assertCndbcrAccount(companyId, cuentaConta) {
  if (!cuentaConta) return null;
  const { rows } = await pool.query(
    `SELECT id FROM accounting_accounts WHERE id = $1 AND company_id = $2`,
    [cuentaConta, companyId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Cuenta contable no encontrada en el plan de cuentas'), { status: 400 });
  }
  return cuentaConta;
}

export async function assertActiveCndbcrForNota(cndbcrId, companyId) {
  if (!cndbcrId) {
    throw Object.assign(new Error('Seleccione el concepto de la nota'), { status: 400 });
  }
  const concept = await loadCndbcr(cndbcrId, companyId, { activeOnly: true });
  if (!concept) {
    throw Object.assign(new Error('Concepto de nota no encontrado o inactivo'), { status: 400 });
  }
  return concept;
}
