import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requirePermission, hasPermission } from '../../middleware/permissions.js';
import { buildFullNumber } from '../../utils/invoice-dian-number.js';
import { formatClient, prepareClientPayload } from '../../utils/client-format.js';
import { lookupDianAcquirer, validateAndEnrichClientWithDian } from '../../utils/dian-acquirer.js';
import { peekNextServiceCode } from '../../utils/company-settings.js';
import { formatService, assertServiceNotDuplicate } from '../../utils/service-catalog.js';
import { buildCajaArqueoPdf, buildCajaArqueoPdfFileName } from '../../utils/caja-arqueo-pdf.js';

const router = Router();

export const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta_debito', label: 'Tarjeta débito' },
  { value: 'tarjeta_credito', label: 'Tarjeta crédito' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'otro', label: 'Otro' },
];

const VALID_PAYMENT_METHODS = new Set(PAYMENT_METHODS.map((p) => p.value));
const RECEIPT_CONCEPT_EGRESO = 'Egreso de caja';
const RECEIPT_CONCEPT_SALDO = 'Saldo pendiente apertura';

const RECEIPT_STATUS = {
  BORRADOR: 'borrador',
  CONFIRMADO: 'confirmado',
  ANULADO: 'anulado',
  DESCARTADO: 'descartado',
};

const RECEIPT_STATUS_LABELS = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  anulado: 'Anulado',
  descartado: 'Descartado',
};

const RECEIPT_TOTALS_FILTER = `status = '${RECEIPT_STATUS.CONFIRMADO}'`;

const RECEIPT_SELECT_EXTRA = `
  s.code AS service_code,
  s.description AS service_description
`;

const RECEIPT_JOINS = `
  LEFT JOIN users u ON u.id = cr.created_by
  LEFT JOIN clients c ON c.id = cr.client_id
  LEFT JOIN invoices i ON i.id = cr.invoice_id
  LEFT JOIN services s ON s.id = cr.service_id
`;

function paymentMethodLabel(code) {
  return PAYMENT_METHODS.find((p) => p.value === code)?.label || code;
}


async function amountToTaxInclusiveLine(total, taxRate = 19) {
  const rate = Number(taxRate) || 0;
  const base = Math.round((total / (1 + rate / 100)) * 100) / 100;
  const taxAmount = Math.round((total - base) * 100) / 100;
  return { unitPrice: base, taxAmount, lineTotal: total, taxRate: rate };
}

async function loadUserCashContext(userId, companyId, role) {
  if (role === 'company_admin') {
    return { cashRegisterId: null, isAdmin: true };
  }
  const { rows } = await pool.query(
    `SELECT cash_register_id FROM users WHERE id = $1 AND company_id = $2`,
    [userId, companyId],
  );
  return { cashRegisterId: rows[0]?.cash_register_id || null, isAdmin: false };
}

async function assertRegisterAccess(req, registerId) {
  const ctx = await loadUserCashContext(req.user.userId, req.user.companyId, req.user.role);
  if (ctx.isAdmin) return ctx;
  if (!ctx.cashRegisterId) {
    throw Object.assign(new Error('No tiene caja asignada. Contacte al administrador.'), { status: 403 });
  }
  if (registerId && registerId !== ctx.cashRegisterId) {
    throw Object.assign(new Error('No tiene acceso a esta caja'), { status: 403 });
  }
  return ctx;
}

function registerFilterSql(ctx, alias, values) {
  if (ctx.isAdmin || !ctx.cashRegisterId) return '';
  values.push(ctx.cashRegisterId);
  return ` AND ${alias}.cash_register_id = $${values.length}`;
}

function formatRegister(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    allowCloseWithBalance: row.allow_close_with_balance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatSession(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    sessionNumber: row.session_number,
    cashRegisterId: row.cash_register_id,
    registerCode: row.register_code,
    registerName: row.register_name,
    sessionDate: row.session_date,
    status: row.status,
    openingAmount: Number(row.opening_amount),
    openingNotes: row.opening_notes,
    openedAt: row.opened_at,
    openedByName: row.opened_by_name,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    closingNotes: row.closing_notes,
    totalIngress: Number(row.total_ingress),
    totalEgress: Number(row.total_egress),
    expectedBalance: row.expected_balance != null ? Number(row.expected_balance) : null,
    countedBalance: row.counted_balance != null ? Number(row.counted_balance) : null,
    balanceDifference: row.balance_difference != null ? Number(row.balance_difference) : null,
    closedWithBalance: row.closed_with_balance,
    carriedBalance: row.carried_balance != null ? Number(row.carried_balance) : null,
    ...extras,
  };
}

function formatReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    cashSessionId: row.cash_session_id,
    cashRegisterId: row.cash_register_id,
    receiptNumber: row.receipt_number,
    receiptDate: row.receipt_date,
    movementType: row.movement_type,
    receiptKind: row.receipt_kind,
    isSystem: row.is_system,
    paymentMethod: row.payment_method,
    paymentMethodLabel: paymentMethodLabel(row.payment_method),
    concept: row.concept,
    amount: Number(row.amount),
    serviceId: row.service_id,
    serviceCode: row.service_code,
    serviceDescription: row.service_description,
    clientId: row.client_id,
    clientName: row.client_name,
    clientDocument: row.client_document,
    notes: row.notes,
    invoiceId: row.invoice_id,
    invoiceFullNumber: row.invoice_full_number,
    status: row.status || (row.is_system ? RECEIPT_STATUS.CONFIRMADO : RECEIPT_STATUS.BORRADOR),
    statusLabel: RECEIPT_STATUS_LABELS[row.status || (row.is_system ? RECEIPT_STATUS.CONFIRMADO : RECEIPT_STATUS.BORRADOR)] || row.status,
    confirmedAt: row.confirmed_at,
    voidedAt: row.voided_at,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  };
}

function formatPaymentBalance(row) {
  return {
    paymentMethod: row.payment_method,
    paymentMethodLabel: paymentMethodLabel(row.payment_method),
    expectedAmount: Number(row.expected_amount),
    countedAmount: Number(row.counted_amount),
    difference: Number(row.difference),
  };
}

async function nextReceiptNumber(client, companyId) {
  const { rows } = await client.query(
    `SELECT receipt_number FROM cash_receipts
     WHERE company_id = $1 AND receipt_number ~ '^REC-[0-9]+$'
     ORDER BY receipt_number DESC
     LIMIT 1
     FOR UPDATE`,
    [companyId],
  );
  let next = 1;
  if (rows[0]?.receipt_number) {
    next = parseInt(rows[0].receipt_number.replace('REC-', ''), 10) + 1;
  }
  return `REC-${String(next).padStart(6, '0')}`;
}

async function nextSessionNumber(client, companyId) {
  const { rows } = await client.query(
    `SELECT session_number FROM cash_sessions
     WHERE company_id = $1 AND session_number ~ '^APC-[0-9]+$'
     ORDER BY session_number DESC
     LIMIT 1
     FOR UPDATE`,
    [companyId],
  );
  let next = 1;
  if (rows[0]?.session_number) {
    next = parseInt(rows[0].session_number.replace('APC-', ''), 10) + 1;
  }
  return `APC-${String(next).padStart(6, '0')}`;
}

async function recalculateSessionTotals(client, sessionId, companyId) {
  const { rows } = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'ingreso' THEN amount ELSE 0 END), 0) AS ingress,
       COALESCE(SUM(CASE WHEN movement_type = 'egreso' THEN amount ELSE 0 END), 0) AS egress
     FROM cash_receipts
     WHERE cash_session_id = $1 AND company_id = $2 AND ${RECEIPT_TOTALS_FILTER}`,
    [sessionId, companyId],
  );
  const totalIngress = Number(rows[0].ingress);
  const totalEgress = Number(rows[0].egress);
  await client.query(
    `UPDATE cash_sessions SET total_ingress = $1, total_egress = $2 WHERE id = $3 AND company_id = $4`,
    [totalIngress, totalEgress, sessionId, companyId],
  );
  return { totalIngress, totalEgress };
}

async function computeExpectedByMethod(client, session, companyId) {
  const { rows: expectedRows } = await client.query(
    `SELECT payment_method,
            COALESCE(SUM(CASE WHEN movement_type = 'ingreso' THEN amount ELSE -amount END), 0) AS net
     FROM cash_receipts
     WHERE cash_session_id = $1 AND company_id = $2 AND ${RECEIPT_TOTALS_FILTER}
     GROUP BY payment_method`,
    [session.id, companyId],
  );
  const expectedMap = Object.fromEntries(
    expectedRows.map((r) => [r.payment_method, Number(r.net)]),
  );
  expectedMap.efectivo = (expectedMap.efectivo || 0) + Number(session.opening_amount);
  return expectedMap;
}

async function hasEgresoCaja(client, sessionId, companyId) {
  const { rows } = await client.query(
    `SELECT 1 FROM cash_receipts
     WHERE cash_session_id = $1 AND company_id = $2
       AND receipt_kind = 'egreso_caja' AND ${RECEIPT_TOTALS_FILTER}
     LIMIT 1`,
    [sessionId, companyId],
  );
  return !!rows[0];
}

async function countPendingReceipts(client, sessionId, companyId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count FROM cash_receipts
     WHERE cash_session_id = $1 AND company_id = $2 AND status = $3`,
    [sessionId, companyId, RECEIPT_STATUS.BORRADOR],
  );
  return Number(rows[0].count);
}

async function loadSessionById(sessionId, companyId) {
  const { rows } = await pool.query(
    `SELECT s.*, r.code AS register_code, r.name AS register_name,
            r.allow_close_with_balance,
            ou.full_name AS opened_by_name, cu.full_name AS closed_by_name
     FROM cash_sessions s
     JOIN cash_registers r ON r.id = s.cash_register_id
     LEFT JOIN users ou ON ou.id = s.opened_by
     LEFT JOIN users cu ON cu.id = s.closed_by
     WHERE s.id = $1 AND s.company_id = $2`,
    [sessionId, companyId],
  );
  return rows[0] || null;
}

async function loadRegister(registerId, companyId) {
  const { rows } = await pool.query(
    `SELECT * FROM cash_registers WHERE id = $1 AND company_id = $2`,
    [registerId, companyId],
  );
  return rows[0] || null;
}

async function companyHasFacturacion(companyId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM company_modules cm
     JOIN modules m ON m.id = cm.module_id
     WHERE cm.company_id = $1 AND cm.is_enabled = true AND m.code = 'facturacion'`,
    [companyId],
  );
  return !!rows[0];
}

async function insertReceipt(client, {
  companyId,
  session,
  movementType,
  receiptKind,
  paymentMethod,
  concept,
  amount,
  clientId,
  serviceId,
  notes,
  userId,
  isSystem = false,
  status,
}) {
  const receiptNumber = await nextReceiptNumber(client, companyId);
  const finalStatus = status || (isSystem ? RECEIPT_STATUS.CONFIRMADO : RECEIPT_STATUS.BORRADOR);
  const isConfirmed = finalStatus === RECEIPT_STATUS.CONFIRMADO;

  const { rows } = await client.query(
    `INSERT INTO cash_receipts (
       company_id, cash_session_id, cash_register_id, receipt_number, receipt_date,
       movement_type, receipt_kind, is_system, payment_method, concept, amount,
       client_id, service_id, notes, created_by, status, confirmed_at, confirmed_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
    [
      companyId,
      session.id,
      session.cash_register_id,
      receiptNumber,
      session.session_date,
      movementType,
      receiptKind,
      isSystem,
      paymentMethod,
      concept,
      amount,
      clientId || null,
      serviceId || null,
      notes?.trim() || null,
      userId,
      finalStatus,
      isConfirmed ? new Date() : null,
      isConfirmed ? userId : null,
    ],
  );
  await recalculateSessionTotals(client, session.id, companyId);
  return rows[0].id;
}

async function assertReceiptInSession(receipt, session, req) {
  if (!receipt) {
    throw Object.assign(new Error('Recibo no encontrado'), { status: 404 });
  }
  await assertRegisterAccess(req, session.cash_register_id);
  if (session.status !== 'abierta') {
    throw Object.assign(new Error('La sesión está cerrada'), { status: 400 });
  }
}

async function resolveServiceConcept(client, companyId, serviceId) {
  const { rows } = await client.query(
    `SELECT id, description FROM services WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [serviceId, companyId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Servicio no válido'), { status: 400 });
  }
  return rows[0];
}

async function resolveClient(client, companyId, clientId) {
  const { rows } = await client.query(
    `SELECT id FROM clients WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [clientId, companyId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Cliente no válido'), { status: 400 });
  }
}

async function loadReceiptById(receiptId, companyId) {
  const { rows } = await pool.query(
    `SELECT cr.*, u.full_name AS created_by_name,
            COALESCE(c.business_name, TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS client_name,
            c.document_number AS client_document,
            i.full_number AS invoice_full_number,
            ${RECEIPT_SELECT_EXTRA}
     FROM cash_receipts cr
     ${RECEIPT_JOINS}
     WHERE cr.id = $1 AND cr.company_id = $2`,
    [receiptId, companyId],
  );
  return rows[0] || null;
}

const sessionSelect = `
  SELECT s.*, r.code AS register_code, r.name AS register_name,
         r.allow_close_with_balance,
         ou.full_name AS opened_by_name, cu.full_name AS closed_by_name
  FROM cash_sessions s
  JOIN cash_registers r ON r.id = s.cash_register_id
  LEFT JOIN users ou ON ou.id = s.opened_by
  LEFT JOIN users cu ON cu.id = s.closed_by
`;

// --- Catálogo formas de pago ---
router.get('/payment-methods', requirePermission('caja.acceso'), (_req, res) => {
  res.json(PAYMENT_METHODS);
});

// --- Catálogo clientes y servicios (operación de caja) ---
router.get('/catalog/clients', requirePermission('caja.registrar'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM clients
     WHERE company_id = $1 AND is_active = true
     ORDER BY first_name, last_name, business_name`,
    [req.user.companyId],
  );
  res.json(rows.map(formatClient));
});

router.get('/catalog/clients/dian-lookup', requirePermission('ventas.clientes'), async (req, res) => {
  try {
    const { documentType, documentNumber } = req.query;
    const lookup = await lookupDianAcquirer(
      req.user.companyId,
      documentType,
      documentNumber,
    );
    res.json({
      found: lookup.found,
      statusCode: lookup.statusCode,
      message: lookup.message,
      receiverName: lookup.receiverName,
      receiverEmail: lookup.receiverEmail,
      suggested: lookup.suggested,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        missing: err.missing,
        hint: err.hint,
      });
    }
    throw err;
  }
});

router.post('/catalog/clients', requirePermission('ventas.clientes'), async (req, res) => {
  try {
    const p = prepareClientPayload(req.body);
    const dianResult = await validateAndEnrichClientWithDian(req.user.companyId, p);
    const { rows } = await pool.query(
      `INSERT INTO clients (
         company_id, document_type, document_number, verification_digit,
         person_type, tax_level_code, business_name,
         first_name, middle_name, last_name, phone, email, address,
         city_code, city_name, department_code, department_name, country_code
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        req.user.companyId, p.documentType, p.documentNumber, p.verificationDigit,
        p.personType, p.taxLevelCode, p.businessName,
        p.firstName, p.middleName, p.lastName, p.phone, p.email, p.address,
        p.cityCode, p.cityName, p.departmentCode, p.departmentName, p.countryCode,
      ],
    );
    res.status(201).json({
      ...formatClient(rows[0]),
      dianValidation: dianResult,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Documento ya registrado' });
    throw err;
  }
});

router.get('/catalog/services', requirePermission('caja.registrar'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM services
     WHERE company_id = $1 AND is_active = true
     ORDER BY description`,
    [req.user.companyId],
  );
  res.json(rows.map(formatService));
});

router.get('/catalog/services/next-code', requirePermission('ventas.servicios'), async (req, res) => {
  try {
    res.json(await peekNextServiceCode(pool, req.user.companyId));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.post('/catalog/services', requirePermission('ventas.servicios'), async (req, res) => {
  const { code, description, basePrice, durationMinutes } = req.body;
  const desc = String(description || '').trim();
  if (!desc) return res.status(400).json({ error: 'Descripción requerida' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertServiceNotDuplicate(client, req.user.companyId, desc);
    const serviceCode = code?.trim() || (await peekNextServiceCode(client, req.user.companyId)).nextCode;
    const { rows } = await client.query(
      `INSERT INTO services (company_id, code, description, base_price, duration_minutes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.companyId, serviceCode, desc, basePrice, durationMinutes || 30],
    );
    await client.query('COMMIT');
    res.status(201).json(formatService(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Código ya registrado' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

// --- Cajas (registers) ---
router.get('/registers', requirePermission('caja.acceso'), async (req, res) => {
  const ctx = await loadUserCashContext(req.user.userId, req.user.companyId, req.user.role);
  const values = [req.user.companyId];
  let sql = `SELECT * FROM cash_registers WHERE company_id = $1`;
  sql += registerFilterSql(ctx, 'cash_registers', values);
  sql += ' ORDER BY code';
  const { rows } = await pool.query(sql, values);
  res.json(rows.map(formatRegister));
});

router.post('/registers', requirePermission('caja.configurar'), async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const name = String(req.body.name || '').trim();
  if (!code || !name) {
    return res.status(400).json({ error: 'Código y nombre son requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO cash_registers (company_id, code, name, description, allow_close_with_balance)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        req.user.companyId,
        code,
        name,
        req.body.description?.trim() || null,
        Boolean(req.body.allowCloseWithBalance),
      ],
    );
    res.status(201).json(formatRegister(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una caja con ese código' });
    throw err;
  }
});

router.put('/registers/:id', requirePermission('caja.configurar'), async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const { rows } = await pool.query(
    `UPDATE cash_registers SET
       name = $1,
       description = $2,
       is_active = COALESCE($3, is_active),
       allow_close_with_balance = COALESCE($4, allow_close_with_balance),
       updated_at = NOW()
     WHERE id = $5 AND company_id = $6
     RETURNING *`,
    [
      name,
      req.body.description?.trim() || null,
      req.body.isActive,
      req.body.allowCloseWithBalance,
      req.params.id,
      req.user.companyId,
    ],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Caja no encontrada' });
  res.json(formatRegister(rows[0]));
});

// --- Sesiones ---
router.get('/sessions/current', requirePermission('caja.acceso'), async (req, res) => {
  const { registerId } = req.query;
  if (!registerId) return res.status(400).json({ error: 'registerId requerido' });
  try {
    await assertRegisterAccess(req, registerId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const { rows } = await pool.query(
    `${sessionSelect}
     WHERE s.company_id = $1 AND s.cash_register_id = $2 AND s.status = 'abierta'`,
    [req.user.companyId, registerId],
  );
  if (!rows[0]) return res.json(null);

  const totals = await recalculateSessionTotals(pool, rows[0].id, req.user.companyId);
  const sessionRow = {
    ...rows[0],
    total_ingress: totals.totalIngress,
    total_egress: totals.totalEgress,
  };

  const session = formatSession(sessionRow);
  const expectedMap = await computeExpectedByMethod(pool, sessionRow, req.user.companyId);
  const hasEgreso = await hasEgresoCaja(pool, rows[0].id, req.user.companyId);
  session.cashExpected = expectedMap.efectivo || 0;
  session.hasEgresoCaja = hasEgreso;
  session.canCloseWithBalance = Boolean(rows[0].allow_close_with_balance)
    || await hasPermission(req.user, 'caja.cerrar_con_saldo');
  res.json(session);
});

router.get('/sessions', requirePermission('caja.ver_historial'), async (req, res) => {
  const { registerId, from, to, status } = req.query;
  const ctx = await loadUserCashContext(req.user.userId, req.user.companyId, req.user.role);
  const values = [req.user.companyId];
  let sql = `${sessionSelect} WHERE s.company_id = $1`;

  if (registerId) {
    try {
      await assertRegisterAccess(req, registerId);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
    values.push(registerId);
    sql += ` AND s.cash_register_id = $${values.length}`;
  } else {
    sql += registerFilterSql(ctx, 's', values);
  }

  if (from) {
    values.push(from);
    sql += ` AND s.session_date >= $${values.length}`;
  }
  if (to) {
    values.push(to);
    sql += ` AND s.session_date <= $${values.length}`;
  }
  if (status) {
    values.push(status);
    sql += ` AND s.status = $${values.length}`;
  }
  sql += ' ORDER BY s.opened_at DESC LIMIT 200';
  const { rows } = await pool.query(sql, values);
  res.json(rows.map((r) => formatSession(r)));
});

router.get('/sessions/:id', requirePermission('caja.acceso'), async (req, res) => {
  const session = await loadSessionById(req.params.id, req.user.companyId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const [receiptsRes, balancesRes] = await Promise.all([
    pool.query(
      `SELECT cr.*, u.full_name AS created_by_name,
              COALESCE(c.business_name, TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS client_name,
              c.document_number AS client_document,
              i.full_number AS invoice_full_number,
              ${RECEIPT_SELECT_EXTRA}
       FROM cash_receipts cr
       ${RECEIPT_JOINS}
       WHERE cr.cash_session_id = $1 AND cr.company_id = $2
       ORDER BY cr.created_at DESC`,
      [req.params.id, req.user.companyId],
    ),
    pool.query(
      `SELECT * FROM cash_session_payment_balances WHERE cash_session_id = $1 ORDER BY payment_method`,
      [req.params.id],
    ),
  ]);

  res.json({
    ...formatSession(session),
    receipts: receiptsRes.rows.map(formatReceipt),
    paymentBalances: balancesRes.rows.map(formatPaymentBalance),
  });
});

router.get('/sessions/:id/arqueo-pdf', requirePermission('caja.acceso'), async (req, res) => {
  const session = await loadSessionById(req.params.id, req.user.companyId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const [receiptsRes, balancesRes, companyRes] = await Promise.all([
    pool.query(
      `SELECT cr.*, u.full_name AS created_by_name,
              COALESCE(c.business_name, TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS client_name,
              c.document_number AS client_document,
              i.full_number AS invoice_full_number,
              ${RECEIPT_SELECT_EXTRA}
       FROM cash_receipts cr
       ${RECEIPT_JOINS}
       WHERE cr.cash_session_id = $1 AND cr.company_id = $2
       ORDER BY cr.created_at ASC`,
      [req.params.id, req.user.companyId],
    ),
    pool.query(
      `SELECT * FROM cash_session_payment_balances WHERE cash_session_id = $1 ORDER BY payment_method`,
      [req.params.id],
    ),
    pool.query(
      `SELECT name, nit, address, phone FROM companies WHERE id = $1`,
      [req.user.companyId],
    ),
  ]);

  const sessionData = formatSession(session);
  const receipts = receiptsRes.rows.map(formatReceipt);
  const paymentBalances = balancesRes.rows.map(formatPaymentBalance);

  let pdfBuffer;
  try {
    pdfBuffer = await buildCajaArqueoPdf({
      company: companyRes.rows[0] || {},
      session: sessionData,
      receipts,
      paymentBalances,
    });
  } catch (err) {
    console.error('[caja-arqueo-pdf]', err);
    return res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
  }

  const fileName = buildCajaArqueoPdfFileName(sessionData);
  const forceDownload = req.query.download === '1' || req.query.download === 'true';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Download-Filename', fileName);
  res.setHeader(
    'Content-Disposition',
    `${forceDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
  );
  res.send(pdfBuffer);
});

router.post('/sessions/open', requirePermission('caja.abrir'), async (req, res) => {
  const { cashRegisterId, sessionDate, openingAmount, openingNotes } = req.body;
  if (!cashRegisterId) return res.status(400).json({ error: 'Caja requerida' });

  try {
    await assertRegisterAccess(req, cashRegisterId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const date = sessionDate || new Date().toISOString().slice(0, 10);
  const opening = Number(openingAmount) || 0;
  if (opening < 0) return res.status(400).json({ error: 'Saldo inicial inválido' });

  const register = await loadRegister(cashRegisterId, req.user.companyId);
  if (!register || !register.is_active) {
    return res.status(404).json({ error: 'Caja no encontrada o inactiva' });
  }

  const { rows: openRows } = await pool.query(
    `SELECT id FROM cash_sessions WHERE cash_register_id = $1 AND status = 'abierta'`,
    [cashRegisterId],
  );
  if (openRows[0]) {
    return res.status(409).json({ error: 'Esta caja ya tiene una sesión abierta' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionNumber = await nextSessionNumber(client, req.user.companyId);
    const { rows } = await client.query(
      `INSERT INTO cash_sessions (
         company_id, cash_register_id, session_date, session_number,
         opening_amount, opening_notes, opened_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.companyId, cashRegisterId, date, sessionNumber, opening, openingNotes?.trim() || null, req.user.userId],
    );
    const newSession = rows[0];

    const { rows: prevRows } = await client.query(
      `SELECT id, carried_balance FROM cash_sessions
       WHERE company_id = $1 AND cash_register_id = $2 AND status = 'cerrada'
         AND closed_with_balance = true AND carried_balance > 0 AND balance_forwarded = false
       ORDER BY closed_at DESC NULLS LAST
       LIMIT 1`,
      [req.user.companyId, cashRegisterId],
    );

    if (prevRows[0]) {
      const carried = Number(prevRows[0].carried_balance);
      await insertReceipt(client, {
        companyId: req.user.companyId,
        session: newSession,
        movementType: 'ingreso',
        receiptKind: 'saldo_apertura',
        paymentMethod: 'efectivo',
        concept: RECEIPT_CONCEPT_SALDO,
        amount: carried,
        userId: req.user.userId,
        isSystem: true,
      });
      await client.query(
        `UPDATE cash_sessions SET balance_forwarded = true WHERE id = $1`,
        [prevRows[0].id],
      );
    }

    await client.query('COMMIT');
    const session = await loadSessionById(newSession.id, req.user.companyId);
    res.status(201).json(formatSession(session));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una sesión abierta para esta caja' });
    }
    throw err;
  } finally {
    client.release();
  }
});

router.post('/sessions/:id/close', requirePermission('caja.cerrar'), async (req, res) => {
  const session = await loadSessionById(req.params.id, req.user.companyId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
  if (session.status === 'cerrada') return res.status(400).json({ error: 'La sesión ya está cerrada' });

  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const paymentBalances = Array.isArray(req.body.paymentBalances) ? req.body.paymentBalances : [];
  const closingNotes = req.body.closingNotes?.trim() || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pending = await countPendingReceipts(client, session.id, req.user.companyId);
    if (pending > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Hay ${pending} recibo(s) en borrador. Confírmelos o deséchele antes de cerrar.`,
        code: 'PENDING_RECEIPTS',
      });
    }

    const totals = await recalculateSessionTotals(client, session.id, req.user.companyId);
    const expectedMap = await computeExpectedByMethod(client, session, req.user.companyId);
    const efectivoExpected = expectedMap.efectivo || 0;
    const hasEgreso = await hasEgresoCaja(client, session.id, req.user.companyId);
    const canCloseWithBalance = Boolean(session.allow_close_with_balance)
      || await hasPermission(req.user, 'caja.cerrar_con_saldo');

    if (efectivoExpected > 0.005 && !hasEgreso && !canCloseWithBalance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Debe registrar el egreso de caja antes de cerrar',
        code: 'EGRESO_REQUIRED',
        cashExpected: efectivoExpected,
      });
    }

    const closedWithBalance = efectivoExpected > 0.005 && !hasEgreso && canCloseWithBalance;
    const carriedBalance = closedWithBalance ? efectivoExpected : 0;

    const methodsToClose = paymentBalances.length
      ? paymentBalances
      : PAYMENT_METHODS.map((p) => ({ paymentMethod: p.value, countedAmount: expectedMap[p.value] || 0 }));

    let totalCounted = 0;
    let totalExpected = Number(session.opening_amount) + totals.totalIngress - totals.totalEgress;

    for (const item of methodsToClose) {
      const method = item.paymentMethod || item.payment_method;
      if (!VALID_PAYMENT_METHODS.has(method)) {
        throw Object.assign(new Error(`Forma de pago inválida: ${method}`), { status: 400 });
      }
      const expected = expectedMap[method] || 0;
      const counted = Number(item.countedAmount ?? item.counted_amount ?? 0);
      const difference = counted - expected;
      totalCounted += counted;

      await client.query(
        `INSERT INTO cash_session_payment_balances (
           cash_session_id, payment_method, expected_amount, counted_amount, difference
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (cash_session_id, payment_method)
         DO UPDATE SET expected_amount = $3, counted_amount = $4, difference = $5`,
        [session.id, method, expected, counted, difference],
      );
    }

    const balanceDifference = totalCounted - totalExpected;

    await client.query(
      `UPDATE cash_sessions SET
         status = 'cerrada',
         closed_at = NOW(),
         closed_by = $1,
         closing_notes = $2,
         total_ingress = $3,
         total_egress = $4,
         expected_balance = $5,
         counted_balance = $6,
         balance_difference = $7,
         closed_with_balance = $8,
         carried_balance = $9
       WHERE id = $10 AND company_id = $11`,
      [
        req.user.userId,
        closingNotes,
        totals.totalIngress,
        totals.totalEgress,
        totalExpected,
        totalCounted,
        balanceDifference,
        closedWithBalance,
        carriedBalance || null,
        session.id,
        req.user.companyId,
      ],
    );

    await client.query('COMMIT');

    const closed = await loadSessionById(session.id, req.user.companyId);
    const { rows: balances } = await pool.query(
      `SELECT * FROM cash_session_payment_balances WHERE cash_session_id = $1 ORDER BY payment_method`,
      [session.id],
    );

    res.json({
      ...formatSession(closed),
      paymentBalances: balances.map(formatPaymentBalance),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

// --- Recibos ---
router.get('/receipts', requirePermission('caja.acceso'), async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });

  const session = await loadSessionById(sessionId, req.user.companyId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  if (session.status !== 'abierta') {
    return res.json([]);
  }

  const { rows } = await pool.query(
    `SELECT cr.*, u.full_name AS created_by_name,
            COALESCE(c.business_name, TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS client_name,
            c.document_number AS client_document,
            i.full_number AS invoice_full_number,
            ${RECEIPT_SELECT_EXTRA}
     FROM cash_receipts cr
     ${RECEIPT_JOINS}
     WHERE cr.cash_session_id = $1 AND cr.company_id = $2
       AND cr.status != 'descartado'
     ORDER BY cr.created_at DESC`,
    [sessionId, req.user.companyId],
  );
  res.json(rows.map(formatReceipt));
});

router.get('/receipts/:id/print', requirePermission('caja.acceso'), async (req, res) => {
  const receipt = await loadReceiptById(req.params.id, req.user.companyId);
  if (!receipt) return res.status(404).json({ error: 'Recibo no encontrado' });
  if (receipt.status !== RECEIPT_STATUS.CONFIRMADO) {
    return res.status(400).json({ error: 'Solo se puede imprimir un recibo confirmado' });
  }

  const session = await loadSessionById(receipt.cash_session_id, req.user.companyId);
  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const { rows: companyRows } = await pool.query(
    `SELECT name, nit, address, phone, email FROM companies WHERE id = $1`,
    [req.user.companyId],
  );
  const company = companyRows[0];

  res.json({
    receipt: formatReceipt(receipt),
    session: {
      sessionNumber: session.session_number,
      registerName: session.register_name,
      openedAt: session.opened_at,
    },
    company: {
      name: company.name,
      nit: company.nit,
      address: company.address,
      phone: company.phone,
      email: company.email,
    },
  });
});

router.post('/receipts', requirePermission('caja.registrar'), async (req, res) => {
  const {
    cashSessionId,
    movementType,
    paymentMethod,
    amount,
    clientId,
    serviceId,
    notes,
    receiptKind,
  } = req.body;

  if (!cashSessionId) return res.status(400).json({ error: 'Sesión requerida' });
  if (!['ingreso', 'egreso'].includes(movementType)) {
    return res.status(400).json({ error: 'Tipo de movimiento inválido' });
  }
  const method = paymentMethod || 'efectivo';
  if (!VALID_PAYMENT_METHODS.has(method)) {
    return res.status(400).json({ error: 'Forma de pago inválida' });
  }
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'Monto inválido' });

  const session = await loadSessionById(cashSessionId, req.user.companyId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
  if (session.status !== 'abierta') {
    return res.status(400).json({ error: 'La sesión está cerrada; no se pueden registrar movimientos' });
  }

  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  let kind = receiptKind || (movementType === 'egreso' ? 'egreso_caja' : 'servicios');
  let concept;
  let resolvedClientId = null;
  let resolvedServiceId = null;

  if (movementType === 'ingreso') {
    kind = 'servicios';
    if (!clientId) return res.status(400).json({ error: 'Cliente requerido' });
    if (!serviceId) return res.status(400).json({ error: 'Servicio requerido' });

    const { rows: clientRows } = await pool.query(
      `SELECT id FROM clients WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [clientId, req.user.companyId],
    );
    if (!clientRows[0]) return res.status(400).json({ error: 'Cliente no válido' });

    const { rows: serviceRows } = await pool.query(
      `SELECT id, description FROM services WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [serviceId, req.user.companyId],
    );
    if (!serviceRows[0]) return res.status(400).json({ error: 'Servicio no válido' });

    resolvedClientId = clientId;
    resolvedServiceId = serviceId;
    concept = serviceRows[0].description;
  } else if (kind === 'egreso_caja') {
    concept = RECEIPT_CONCEPT_EGRESO;
  } else {
    return res.status(400).json({ error: 'Tipo de egreso no permitido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const receiptId = await insertReceipt(client, {
      companyId: req.user.companyId,
      session,
      movementType,
      receiptKind: kind,
      paymentMethod: method,
      concept,
      amount: value,
      clientId: resolvedClientId,
      serviceId: resolvedServiceId,
      notes,
      userId: req.user.userId,
    });
    await client.query('COMMIT');

    const receipt = await loadReceiptById(receiptId, req.user.companyId);
    res.status(201).json(formatReceipt(receipt));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/receipts/:id', requirePermission('caja.registrar'), async (req, res) => {
  const receipt = await loadReceiptById(req.params.id, req.user.companyId);
  const session = receipt
    ? await loadSessionById(receipt.cash_session_id, req.user.companyId)
    : null;

  try {
    await assertReceiptInSession(receipt, session, req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (receipt.is_system) {
    return res.status(400).json({ error: 'No se puede editar un movimiento automático de caja' });
  }
  if (receipt.status !== RECEIPT_STATUS.BORRADOR) {
    return res.status(400).json({ error: 'Solo se pueden editar recibos en borrador' });
  }
  if (receipt.receipt_kind !== 'servicios' || receipt.movement_type !== 'ingreso') {
    return res.status(400).json({ error: 'Solo se pueden editar recibos de servicios' });
  }

  const { clientId, serviceId, paymentMethod, amount, notes } = req.body;
  if (!clientId) return res.status(400).json({ error: 'Cliente requerido' });
  if (!serviceId) return res.status(400).json({ error: 'Servicio requerido' });
  const method = paymentMethod || receipt.payment_method;
  if (!VALID_PAYMENT_METHODS.has(method)) {
    return res.status(400).json({ error: 'Forma de pago inválida' });
  }
  const value = Number(amount);
  if (!value || value <= 0) return res.status(400).json({ error: 'Monto inválido' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await resolveClient(client, req.user.companyId, clientId);
    const service = await resolveServiceConcept(client, req.user.companyId, serviceId);

    await client.query(
      `UPDATE cash_receipts SET
         client_id = $1,
         service_id = $2,
         payment_method = $3,
         concept = $4,
         amount = $5,
         notes = $6
       WHERE id = $7 AND company_id = $8`,
      [clientId, serviceId, method, service.description, value, notes?.trim() || null, receipt.id, req.user.companyId],
    );
    await recalculateSessionTotals(client, session.id, req.user.companyId);
    await client.query('COMMIT');

    const updated = await loadReceiptById(receipt.id, req.user.companyId);
    res.json(formatReceipt(updated));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.post('/receipts/:id/confirm', requirePermission('caja.registrar'), async (req, res) => {
  const receipt = await loadReceiptById(req.params.id, req.user.companyId);
  const session = receipt
    ? await loadSessionById(receipt.cash_session_id, req.user.companyId)
    : null;

  try {
    await assertReceiptInSession(receipt, session, req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (receipt.status !== RECEIPT_STATUS.BORRADOR) {
    return res.status(400).json({ error: 'El recibo ya fue confirmado o descartado' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE cash_receipts SET
         status = $1,
         confirmed_at = NOW(),
         confirmed_by = $2
       WHERE id = $3 AND company_id = $4`,
      [RECEIPT_STATUS.CONFIRMADO, req.user.userId, receipt.id, req.user.companyId],
    );
    await recalculateSessionTotals(client, session.id, req.user.companyId);
    await client.query('COMMIT');

    const updated = await loadReceiptById(receipt.id, req.user.companyId);
    res.json(formatReceipt(updated));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/receipts/:id/discard', requirePermission('caja.registrar'), async (req, res) => {
  const receipt = await loadReceiptById(req.params.id, req.user.companyId);
  const session = receipt
    ? await loadSessionById(receipt.cash_session_id, req.user.companyId)
    : null;

  try {
    await assertReceiptInSession(receipt, session, req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (receipt.status !== RECEIPT_STATUS.BORRADOR) {
    return res.status(400).json({ error: 'Solo se pueden desechar recibos en borrador' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE cash_receipts SET status = $1 WHERE id = $2 AND company_id = $3`,
      [RECEIPT_STATUS.DESCARTADO, receipt.id, req.user.companyId],
    );
    await recalculateSessionTotals(client, session.id, req.user.companyId);
    await client.query('COMMIT');
    res.json({ message: 'Recibo desechado' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/receipts/:id/void', requirePermission('caja.registrar'), async (req, res) => {
  const receipt = await loadReceiptById(req.params.id, req.user.companyId);
  const session = receipt
    ? await loadSessionById(receipt.cash_session_id, req.user.companyId)
    : null;

  try {
    await assertReceiptInSession(receipt, session, req);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  if (receipt.status !== RECEIPT_STATUS.CONFIRMADO) {
    return res.status(400).json({ error: 'Solo se pueden anular recibos confirmados' });
  }
  if (receipt.invoice_id) {
    return res.status(400).json({ error: 'No se puede anular un recibo con factura asignada' });
  }
  if (receipt.is_system) {
    return res.status(400).json({ error: 'No se puede anular un movimiento automático de caja' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE cash_receipts SET
         status = $1,
         voided_at = NOW(),
         voided_by = $2
       WHERE id = $3 AND company_id = $4`,
      [RECEIPT_STATUS.ANULADO, req.user.userId, receipt.id, req.user.companyId],
    );
    await recalculateSessionTotals(client, session.id, req.user.companyId);
    await client.query('COMMIT');

    const updated = await loadReceiptById(receipt.id, req.user.companyId);
    res.json(formatReceipt(updated));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/receipts/egreso-caja', requirePermission('caja.registrar'), async (req, res) => {
  const { cashSessionId, amount, paymentMethod, notes } = req.body;
  if (!cashSessionId) return res.status(400).json({ error: 'Sesión requerida' });

  const session = await loadSessionById(cashSessionId, req.user.companyId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
  if (session.status !== 'abierta') {
    return res.status(400).json({ error: 'La sesión está cerrada' });
  }

  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const expectedMap = await computeExpectedByMethod(pool, session, req.user.companyId);
  const efectivoExpected = expectedMap.efectivo || 0;
  const value = amount != null ? Number(amount) : efectivoExpected;

  if (!value || value <= 0) {
    return res.status(400).json({ error: 'No hay saldo en efectivo para egresar' });
  }

  const method = paymentMethod || 'efectivo';
  if (!VALID_PAYMENT_METHODS.has(method)) {
    return res.status(400).json({ error: 'Forma de pago inválida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const receiptId = await insertReceipt(client, {
      companyId: req.user.companyId,
      session,
      movementType: 'egreso',
      receiptKind: 'egreso_caja',
      paymentMethod: method,
      concept: RECEIPT_CONCEPT_EGRESO,
      amount: value,
      notes,
      userId: req.user.userId,
    });
    await client.query('COMMIT');

    const receipt = await loadReceiptById(receiptId, req.user.companyId);
    res.status(201).json(formatReceipt(receipt));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/receipts/:id/invoice', requirePermission('ventas.facturar'), async (req, res) => {
  const receipt = await loadReceiptById(req.params.id, req.user.companyId);
  if (!receipt) return res.status(404).json({ error: 'Recibo no encontrado' });

  if (receipt.movement_type !== 'ingreso' || receipt.receipt_kind !== 'servicios') {
    return res.status(400).json({ error: 'Solo se puede facturar recibos de ingreso por servicios' });
  }
  if (receipt.status !== RECEIPT_STATUS.CONFIRMADO) {
    return res.status(400).json({ error: 'Solo se puede facturar un recibo confirmado' });
  }
  if (receipt.invoice_id) {
    return res.status(400).json({ error: 'Este recibo ya tiene factura asignada' });
  }

  const hasFact = await companyHasFacturacion(req.user.companyId);
  if (!hasFact) {
    return res.status(403).json({ error: 'La compañía no tiene módulo de facturación habilitado' });
  }

  const session = await loadSessionById(receipt.cash_session_id, req.user.companyId);
  try {
    await assertRegisterAccess(req, session.cash_register_id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const clientId = receipt.client_id;
  if (!clientId) {
    return res.status(400).json({ error: 'El recibo no tiene cliente asociado' });
  }

  const { dianResolutionId, emit, taxRate } = req.body;
  if (!dianResolutionId) {
    return res.status(400).json({ error: 'Seleccione la resolución DIAN para facturar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: clientRows } = await client.query(
      `SELECT id FROM clients WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [clientId, req.user.companyId],
    );
    if (!clientRows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cliente no válido' });
    }

    const { rows: resRows } = await client.query(
      `SELECT * FROM dian_resolutions
       WHERE id = $1 AND company_id = $2 AND is_active = true AND document_type = '01'
       FOR UPDATE`,
      [dianResolutionId, req.user.companyId],
    );
    const resolution = resRows[0];
    if (!resolution) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Resolución DIAN de factura no válida' });
    }

    const next = Number(resolution.current_consecutive) + 1;
    if (next > Number(resolution.range_to)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La resolución DIAN agotó el rango de numeración' });
    }

    const fullNumber = buildFullNumber(resolution.prefix, next);
    const rate = taxRate != null ? Number(taxRate) : 19;
    const line = await amountToTaxInclusiveLine(Number(receipt.amount), rate);
    const status = emit !== false ? 'emitida' : 'borrador';

    const { rows: invRows } = await client.query(
      `INSERT INTO invoices (
         company_id, document_kind, dian_resolution_id, client_id,
         prefix, consecutive_number, full_number,
         subtotal, discount_amount, tax_amount, total, status, notes, created_by
       ) VALUES ($1,'factura',$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.user.companyId,
        dianResolutionId,
        clientId,
        resolution.prefix,
        next,
        fullNumber,
        line.unitPrice,
        line.taxAmount,
        line.lineTotal,
        status,
        `Factura generada desde recibo ${receipt.receipt_number}`,
        req.user.userId,
      ],
    );

    if (status === 'emitida') {
      await client.query(
        `UPDATE invoices SET
           issue_date = (NOW() AT TIME ZONE 'America/Bogota')::date,
           issue_time = (NOW() AT TIME ZONE 'America/Bogota')::time
         WHERE id = $1`,
        [invRows[0].id],
      );
    }

    const itemCode = receipt.service_code || 'SERV';
    const itemDescription = receipt.concept || receipt.service_description || 'Servicios';
    const serviceId = receipt.service_id || null;

    await client.query(
      `INSERT INTO invoice_details (
         invoice_id, line_number, service_id, item_code, description, quantity,
         unit_price, discount_amount, tax_rate, tax_amount, line_total
       ) VALUES ($1,1,$2,$3,$4,1,$5,0,$6,$7,$8)`,
      [invRows[0].id, serviceId, itemCode, itemDescription, line.unitPrice, line.taxRate, line.taxAmount, line.lineTotal],
    );

    await client.query(
      `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
      [next, resolution.id],
    );

    await client.query(
      `UPDATE cash_receipts SET invoice_id = $1, client_id = COALESCE(client_id, $2) WHERE id = $3`,
      [invRows[0].id, clientId, receipt.id],
    );

    await client.query('COMMIT');

    const updated = await loadReceiptById(receipt.id, req.user.companyId);
    res.status(201).json({
      receipt: formatReceipt(updated),
      invoice: {
        id: invRows[0].id,
        fullNumber,
        status,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
