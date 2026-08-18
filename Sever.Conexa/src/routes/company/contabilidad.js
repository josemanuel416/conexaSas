import { Router } from 'express';
import multer from 'multer';
import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/permissions.js';
import {
  formatAccount,
  formatVoucherType,
  formatCostCenter,
  formatPeriod,
  formatTax,
  formatTaxClass,
  formatTaxRate,
  buildYearMonth,
} from '../../utils/accounting-helpers.js';
import {
  validateAccountCode,
  parseAccountType,
  parseAccountClass,
  parseRecordStatus,
  parseBoolCell,
} from '../../utils/accounting-chart-rules.js';
import {
  buildChartTemplateExcel,
  buildChartTemplateFileName,
  parseChartImportExcel,
  validateChartImportRows,
  exportCurrentChartExcel,
  buildChartExportFileName,
} from '../../utils/accounting-chart-excel.js';

import attachJournalRoutes from './contabilidad-journal.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const ACCOUNT_TYPES = ['suma', 'detalle'];
const ACCOUNT_CLASSES = ['cxc', 'cxp', 'otros'];
const RECORD_STATUSES = ['activo', 'inactivo'];
const PERIOD_STATUSES = ['abierto', 'cerrado'];

async function loadAccount(companyId, id) {
  const { rows } = await pool.query(
    `SELECT a.*, p.code AS parent_account_code, p.name AS parent_account_name
     FROM accounting_accounts a
     LEFT JOIN accounting_accounts p ON p.id = a.parent_account_id
     WHERE a.id = $1 AND a.company_id = $2`,
    [id, companyId],
  );
  return rows[0] || null;
}

async function loadAccountByCode(companyId, code, client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM accounting_accounts WHERE company_id = $1 AND code = $2`,
    [companyId, code],
  );
  return rows[0] || null;
}

async function resolveParentAccountId(companyId, parentCode, client = pool) {
  if (!parentCode) return null;
  const parent = await loadAccountByCode(companyId, parentCode, client);
  if (!parent) {
    throw Object.assign(new Error(`La cuenta suma "${parentCode}" no existe`), { status: 400 });
  }
  if (parent.account_type !== 'suma') {
    throw Object.assign(new Error(`La cuenta "${parentCode}" debe ser tipo suma`), { status: 400 });
  }
  return parent.id;
}

function buildAccountPayload(body) {
  const codeCheck = validateAccountCode(body.code);
  if (!codeCheck.ok) {
    throw Object.assign(new Error(codeCheck.error), { status: 400 });
  }

  const accountType = parseAccountType(body.accountType);
  if (!accountType) {
    throw Object.assign(new Error('Tipo debe ser suma o detalle'), { status: 400 });
  }

  const accountClass = parseAccountClass(body.accountClass) || 'otros';
  const status = parseRecordStatus(body.status) || 'activo';
  const requiresTax = body.requiresTax != null ? Boolean(body.requiresTax) : parseBoolCell(body.requiresTax);
  const name = body.name?.trim();
  if (!name) {
    throw Object.assign(new Error('Nombre cuenta es requerido'), { status: 400 });
  }

  if (codeCheck.level === 1 && accountType === 'detalle') {
    throw Object.assign(new Error('Las cuentas de nivel 1 deben ser tipo suma'), { status: 400 });
  }

  if (accountType === 'suma' && codeCheck.level > 1 && codeCheck.parentCode) {
    // suma can have parent - ok
  }

  return {
    code: codeCheck.code,
    level: codeCheck.level,
    parentCode: codeCheck.parentCode,
    name,
    accountType,
    accountClass,
    status,
    requiresThirdParty: Boolean(body.requiresThirdParty),
    requiresTax,
    taxCode: requiresTax && body.taxCode?.trim() ? body.taxCode.trim() : null,
    requiresInvoice: Boolean(body.requiresInvoice),
    requiresCostCenter: Boolean(body.requiresCostCenter),
  };
}

async function saveAccountRecord(companyId, payload, existingId = null, client = pool) {
  let parentAccountId = null;
  if (payload.level > 1) {
    parentAccountId = await resolveParentAccountId(companyId, payload.parentCode, client);
  }

  if (existingId) {
    const { rows } = await client.query(
      `UPDATE accounting_accounts SET
         name = $3,
         account_type = $4,
         parent_account_id = $5,
         level = $6,
         account_class = $7,
         status = $8,
         requires_third_party = $9,
         requires_tax = $10,
         tax_code = $11,
         requires_invoice = $12,
         requires_cost_center = $13,
         updated_at = NOW()
       WHERE id = $1 AND company_id = $2
       RETURNING *`,
      [
        existingId,
        companyId,
        payload.name,
        payload.accountType,
        parentAccountId,
        payload.level,
        payload.accountClass,
        payload.status,
        payload.requiresThirdParty,
        payload.requiresTax,
        payload.taxCode,
        payload.requiresInvoice,
        payload.requiresCostCenter,
      ],
    );
    return rows[0];
  }

  const { rows } = await client.query(
    `INSERT INTO accounting_accounts (
       company_id, code, name, account_type, parent_account_id, level, account_class, status,
       requires_third_party, requires_tax, tax_code, requires_invoice, requires_cost_center
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      companyId,
      payload.code,
      payload.name,
      payload.accountType,
      parentAccountId,
      payload.level,
      payload.accountClass,
      payload.status,
      payload.requiresThirdParty,
      payload.requiresTax,
      payload.taxCode,
      payload.requiresInvoice,
      payload.requiresCostCenter,
    ],
  );
  return rows[0];
}

// --- Plan de cuentas ---
router.get('/accounts/template', requirePermission('contabilidad.cuentas'), async (_req, res) => {
  const buffer = await buildChartTemplateExcel();
  const fileName = buildChartTemplateFileName();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(Buffer.from(buffer));
});

router.get('/accounts/export', requirePermission('contabilidad.cuentas'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, p.code AS parent_account_code
     FROM accounting_accounts a
     LEFT JOIN accounting_accounts p ON p.id = a.parent_account_id
     WHERE a.company_id = $1
     ORDER BY a.code`,
    [req.user.companyId],
  );
  const accounts = rows.map((row) => formatAccount(row));
  const buffer = await exportCurrentChartExcel(accounts);
  const fileName = buildChartExportFileName();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(Buffer.from(buffer));
});

router.post('/accounts/import', requirePermission('contabilidad.cuentas'), upload.single('file'), async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'Seleccione un archivo Excel (.xlsx)' });
  }

  try {
    const rawRows = await parseChartImportExcel(req.file.buffer);
    if (!rawRows.length) {
      return res.status(400).json({ error: 'El archivo no contiene filas para importar' });
    }

    const validation = validateChartImportRows(rawRows);
    if (!validation.ok) {
      return res.status(400).json({
        error: 'El plan contable tiene errores de validación',
        errors: validation.errors,
      });
    }

    const client = await pool.connect();
    let inserted = 0;
    let updated = 0;

    try {
      await client.query('BEGIN');

      for (const row of validation.rows) {
        const existing = await loadAccountByCode(req.user.companyId, row.code, client);
        const saved = await saveAccountRecord(req.user.companyId, row, existing?.id || null, client);
        if (existing) updated += 1;
        else inserted += 1;
        if (!saved) {
          throw Object.assign(new Error(`No se pudo guardar la cuenta ${row.code}`), { status: 500 });
        }
      }

      await client.query('COMMIT');
      res.json({
        ok: true,
        inserted,
        updated,
        total: validation.rows.length,
        message: `Plan importado: ${inserted} nuevas, ${updated} actualizadas`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[chart-import]', err);
    return res.status(500).json({ error: err.message || 'No se pudo importar el plan contable' });
  }
});
router.get('/accounts', requirePermission('contabilidad.acceso', 'contabilidad.cuentas'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, p.code AS parent_account_code, p.name AS parent_account_name
     FROM accounting_accounts a
     LEFT JOIN accounting_accounts p ON p.id = a.parent_account_id
     WHERE a.company_id = $1
     ORDER BY a.code`,
    [req.user.companyId],
  );
  res.json(rows.map((row) => formatAccount(row)));
});

router.post('/accounts', requirePermission('contabilidad.cuentas'), async (req, res) => {
  try {
    const payload = buildAccountPayload(req.body);
    const row = await saveAccountRecord(req.user.companyId, payload);
    const saved = await loadAccount(req.user.companyId, row.id);
    res.status(201).json(formatAccount(saved));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El código de cuenta ya existe' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.put('/accounts/:id', requirePermission('contabilidad.cuentas'), async (req, res) => {
  const existing = await loadAccount(req.user.companyId, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' });

  try {
    const payload = buildAccountPayload({ ...req.body, code: existing.code });
    const row = await saveAccountRecord(req.user.companyId, payload, existing.id);
    const saved = await loadAccount(req.user.companyId, row.id);
    res.json(formatAccount(saved));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// --- Tipos de comprobante ---
router.get('/voucher-types', requirePermission('contabilidad.acceso', 'contabilidad.comprobantes'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT vt.*, COALESCE(vs.last_reference, 0) AS last_reference
     FROM accounting_voucher_types vt
     LEFT JOIN accounting_voucher_type_sequences vs ON vs.voucher_type_id = vt.id
     WHERE vt.company_id = $1
     ORDER BY vt.sort_order, vt.code`,
    [req.user.companyId],
  );
  res.json(rows.map(formatVoucherType));
});

router.post('/voucher-types', requirePermission('contabilidad.comprobantes'), async (req, res) => {
  const { code, name, description, status, sortOrder } = req.body;
  if (!code?.trim() || !name?.trim()) {
    return res.status(400).json({ error: 'Código y nombre son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO accounting_voucher_types (company_id, code, name, description, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.companyId,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        description?.trim() || null,
        RECORD_STATUSES.includes(status) ? status : 'activo',
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      ],
    );
    await client.query(
      `INSERT INTO accounting_voucher_type_sequences (company_id, voucher_type_id, last_reference)
       VALUES ($1, $2, 0)`,
      [req.user.companyId, rows[0].id],
    );
    await client.query('COMMIT');
    res.status(201).json(formatVoucherType({ ...rows[0], last_reference: 0 }));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'El código de comprobante ya existe' });
    throw err;
  } finally {
    client.release();
  }
});

router.put('/voucher-types/:id', requirePermission('contabilidad.comprobantes'), async (req, res) => {
  const { name, description, status, sortOrder } = req.body;
  const { rows } = await pool.query(
    `UPDATE accounting_voucher_types SET
       name = COALESCE($3, name),
       description = COALESCE($4, description),
       status = COALESCE($5, status),
       sort_order = COALESCE($6, sort_order),
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [
      req.params.id,
      req.user.companyId,
      name?.trim() || null,
      description?.trim() || null,
      status || null,
      sortOrder != null ? Number(sortOrder) : null,
    ],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Tipo de comprobante no encontrado' });

  const { rows: seq } = await pool.query(
    `SELECT last_reference FROM accounting_voucher_type_sequences WHERE voucher_type_id = $1`,
    [rows[0].id],
  );
  res.json(formatVoucherType({ ...rows[0], last_reference: seq[0]?.last_reference || 0 }));
});

// --- Centros de costo ---
router.get('/cost-centers', requirePermission('contabilidad.acceso', 'contabilidad.centros_costo'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM accounting_cost_centers WHERE company_id = $1 ORDER BY code`,
    [req.user.companyId],
  );
  res.json(rows.map(formatCostCenter));
});

router.post('/cost-centers', requirePermission('contabilidad.centros_costo'), async (req, res) => {
  const { code, name, description, status } = req.body;
  if (!code?.trim() || !name?.trim()) {
    return res.status(400).json({ error: 'Código y nombre son requeridos' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO accounting_cost_centers (company_id, code, name, description, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.companyId,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        description?.trim() || null,
        RECORD_STATUSES.includes(status) ? status : 'activo',
      ],
    );
    res.status(201).json(formatCostCenter(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El código de centro de costo ya existe' });
    throw err;
  }
});

router.put('/cost-centers/:id', requirePermission('contabilidad.centros_costo'), async (req, res) => {
  const { name, description, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE accounting_cost_centers SET
       name = COALESCE($3, name),
       description = COALESCE($4, description),
       status = COALESCE($5, status),
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [
      req.params.id,
      req.user.companyId,
      name?.trim() || null,
      description?.trim() || null,
      status || null,
    ],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Centro de costo no encontrado' });
  res.json(formatCostCenter(rows[0]));
});

// --- Periodos contables ---
router.get('/periods', requirePermission('contabilidad.acceso', 'contabilidad.periodos'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM accounting_periods WHERE company_id = $1 ORDER BY year_month DESC`,
    [req.user.companyId],
  );
  res.json(rows.map(formatPeriod));
});

router.post('/periods', requirePermission('contabilidad.periodos'), async (req, res) => {
  const { year, month, status, description } = req.body;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return res.status(400).json({ error: 'Año y mes válidos son requeridos' });
  }

  const yearMonth = buildYearMonth(y, m);
  try {
    const { rows } = await pool.query(
      `INSERT INTO accounting_periods (company_id, year, month, year_month, status, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.user.companyId,
        y,
        m,
        yearMonth,
        PERIOD_STATUSES.includes(status) ? status : 'abierto',
        description?.trim() || null,
      ],
    );
    res.status(201).json(formatPeriod(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El periodo ya existe' });
    throw err;
  }
});

router.put('/periods/:id', requirePermission('contabilidad.periodos'), async (req, res) => {
  const { status, description } = req.body;
  if (status && !PERIOD_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Estado de periodo inválido' });
  }

  const { rows } = await pool.query(
    `UPDATE accounting_periods SET
       status = COALESCE($3, status),
       description = COALESCE($4, description),
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [
      req.params.id,
      req.user.companyId,
      status || null,
      description?.trim() || null,
    ],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Periodo no encontrado' });
  res.json(formatPeriod(rows[0]));
});

async function loadTax(companyId, id) {
  const { rows } = await pool.query(
    `SELECT * FROM accounting_taxes WHERE id = $1 AND company_id = $2`,
    [id, companyId],
  );
  return rows[0] || null;
}

async function loadTaxClass(companyId, id) {
  const { rows } = await pool.query(
    `SELECT tc.*, t.code AS tax_code, t.name AS tax_name
     FROM accounting_tax_classes tc
     JOIN accounting_taxes t ON t.id = tc.tax_id
     WHERE tc.id = $1 AND tc.company_id = $2`,
    [id, companyId],
  );
  return rows[0] || null;
}

async function loadTaxRate(companyId, id) {
  const { rows } = await pool.query(
    `SELECT tr.*,
            t.code AS tax_code, t.name AS tax_name,
            tc.class_code, tc.description AS class_description,
            a.code AS account_code, a.name AS account_name
     FROM accounting_tax_rates tr
     JOIN accounting_taxes t ON t.id = tr.tax_id
     JOIN accounting_tax_classes tc ON tc.id = tr.tax_class_id
     LEFT JOIN accounting_accounts a ON a.id = tr.account_id
     WHERE tr.id = $1 AND tr.company_id = $2`,
    [id, companyId],
  );
  return rows[0] || null;
}

// --- Impuestos (padre) ---
router.get('/taxes', requirePermission('contabilidad.acceso', 'contabilidad.impuestos'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM accounting_taxes WHERE company_id = $1 ORDER BY code`,
    [req.user.companyId],
  );
  res.json(rows.map(formatTax));
});

router.post('/taxes', requirePermission('contabilidad.impuestos'), async (req, res) => {
  const { code, name, status } = req.body;
  if (!code?.trim() || !name?.trim()) {
    return res.status(400).json({ error: 'Código y nombre son requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO accounting_taxes (company_id, code, name, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        req.user.companyId,
        String(code).trim().toUpperCase(),
        String(name).trim(),
        RECORD_STATUSES.includes(status) ? status : 'activo',
      ],
    );
    res.status(201).json(formatTax(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El código de impuesto ya existe' });
    throw err;
  }
});

router.put('/taxes/:id', requirePermission('contabilidad.impuestos'), async (req, res) => {
  const { name, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE accounting_taxes SET
       name = COALESCE($3, name),
       status = COALESCE($4, status),
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [req.params.id, req.user.companyId, name?.trim() || null, status || null],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Impuesto no encontrado' });
  res.json(formatTax(rows[0]));
});

// --- Clases de impuesto ---
router.get('/tax-classes', requirePermission('contabilidad.acceso', 'contabilidad.impuestos'), async (req, res) => {
  const params = [req.user.companyId];
  let sql = `SELECT tc.*, t.code AS tax_code, t.name AS tax_name
     FROM accounting_tax_classes tc
     JOIN accounting_taxes t ON t.id = tc.tax_id
     WHERE tc.company_id = $1`;
  if (req.query.taxId) {
    params.push(req.query.taxId);
    sql += ` AND tc.tax_id = $${params.length}`;
  }
  sql += ' ORDER BY t.code, tc.class_code';
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(formatTaxClass));
});

router.post('/tax-classes', requirePermission('contabilidad.impuestos'), async (req, res) => {
  const { taxId, classCode, description, status } = req.body;
  if (!taxId || !classCode?.trim()) {
    return res.status(400).json({ error: 'Impuesto padre y clase son requeridos' });
  }
  const tax = await loadTax(req.user.companyId, taxId);
  if (!tax) return res.status(404).json({ error: 'Impuesto padre no encontrado' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO accounting_tax_classes (company_id, tax_id, class_code, description, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.companyId,
        taxId,
        String(classCode).trim().toUpperCase(),
        description?.trim() || null,
        RECORD_STATUSES.includes(status) ? status : 'activo',
      ],
    );
    const saved = await loadTaxClass(req.user.companyId, rows[0].id);
    res.status(201).json(formatTaxClass(saved));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'La clase ya existe para este impuesto' });
    throw err;
  }
});

router.put('/tax-classes/:id', requirePermission('contabilidad.impuestos'), async (req, res) => {
  const { description, status } = req.body;
  const { rows } = await pool.query(
    `UPDATE accounting_tax_classes SET
       description = COALESCE($3, description),
       status = COALESCE($4, status),
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING *`,
    [req.params.id, req.user.companyId, description?.trim() || null, status || null],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Clase de impuesto no encontrada' });
  const saved = await loadTaxClass(req.user.companyId, rows[0].id);
  res.json(formatTaxClass(saved));
});

// --- Vigencias de impuesto ---
router.get('/tax-rates', requirePermission('contabilidad.acceso', 'contabilidad.impuestos'), async (req, res) => {
  const params = [req.user.companyId];
  let sql = `SELECT tr.*,
                    t.code AS tax_code, t.name AS tax_name,
                    tc.class_code, tc.description AS class_description,
                    a.code AS account_code, a.name AS account_name
             FROM accounting_tax_rates tr
             JOIN accounting_taxes t ON t.id = tr.tax_id
             JOIN accounting_tax_classes tc ON tc.id = tr.tax_class_id
             LEFT JOIN accounting_accounts a ON a.id = tr.account_id
             WHERE tr.company_id = $1`;
  if (req.query.taxId) {
    params.push(req.query.taxId);
    sql += ` AND tr.tax_id = $${params.length}`;
  }
  if (req.query.taxClassId) {
    params.push(req.query.taxClassId);
    sql += ` AND tr.tax_class_id = $${params.length}`;
  }
  sql += ' ORDER BY t.code, tc.class_code, tr.start_date DESC';
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(formatTaxRate));
});

router.post('/tax-rates', requirePermission('contabilidad.impuestos'), async (req, res) => {
  const {
    taxId,
    taxClassId,
    rateValue,
    startDate,
    endDate,
    minAmount,
    accountId,
    status,
  } = req.body;

  if (!taxId || !taxClassId || startDate == null || rateValue == null) {
    return res.status(400).json({ error: 'Impuesto, clase, valor y fecha inicio son requeridos' });
  }

  const taxClass = await loadTaxClass(req.user.companyId, taxClassId);
  if (!taxClass || taxClass.tax_id !== taxId) {
    return res.status(400).json({ error: 'La clase no corresponde al impuesto seleccionado' });
  }

  if (accountId) {
    const account = await loadAccount(req.user.companyId, accountId);
    if (!account) return res.status(404).json({ error: 'Cuenta contable no encontrada' });
  }

  const rate = Number(rateValue);
  if (Number.isNaN(rate) || rate < 0) {
    return res.status(400).json({ error: 'Valor de impuesto inválido' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO accounting_tax_rates (
         company_id, tax_id, tax_class_id, rate_value, start_date, end_date,
         min_amount, account_id, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        req.user.companyId,
        taxId,
        taxClassId,
        rate,
        startDate,
        endDate || null,
        minAmount != null ? Number(minAmount) : 0,
        accountId || null,
        RECORD_STATUSES.includes(status) ? status : 'activo',
      ],
    );
    const saved = await loadTaxRate(req.user.companyId, rows[0].id);
    res.status(201).json(formatTaxRate(saved));
  } catch (err) {
    if (err.code === '23514') return res.status(400).json({ error: 'Fechas o montos inválidos' });
    throw err;
  }
});

router.put('/tax-rates/:id', requirePermission('contabilidad.impuestos'), async (req, res) => {
  const {
    rateValue,
    startDate,
    endDate,
    minAmount,
    accountId,
    status,
  } = req.body;

  const existing = await loadTaxRate(req.user.companyId, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vigencia no encontrada' });

  if (accountId) {
    const account = await loadAccount(req.user.companyId, accountId);
    if (!account) return res.status(404).json({ error: 'Cuenta contable no encontrada' });
  }

  const { rows } = await pool.query(
    `UPDATE accounting_tax_rates SET
       rate_value = COALESCE($3, rate_value),
       start_date = COALESCE($4, start_date),
       end_date = $5,
       min_amount = COALESCE($6, min_amount),
       account_id = $7,
       status = COALESCE($8, status),
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2
     RETURNING id`,
    [
      req.params.id,
      req.user.companyId,
      rateValue != null ? Number(rateValue) : null,
      startDate || null,
      endDate === '' ? null : (endDate ?? existing.end_date),
      minAmount != null ? Number(minAmount) : null,
      accountId === '' ? null : (accountId ?? existing.account_id),
      status || null,
    ],
  );
  const saved = await loadTaxRate(req.user.companyId, rows[0].id);
  res.json(formatTaxRate(saved));
});

attachJournalRoutes(router);

export default router;
