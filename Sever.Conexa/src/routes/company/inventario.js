import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requirePermission, hasPermission } from '../../middleware/permissions.js';
import { formatClient, prepareClientPayload } from '../../utils/client-format.js';
import { lookupDianAcquirer, validateAndEnrichClientWithDian } from '../../utils/dian-acquirer.js';
import { setCompanyVariable, listCompanyVariables } from '../../utils/company-settings.js';
import {
  formatWarehouse,
  formatArticleType,
  formatMovementType,
  formatArticle,
  formatBalance,
  formatMovement,
  formatMovementDetail,
  peekNextArticleCode,
  allocateDocumentNumber,
  confirmInventoryMovement,
  loadMovementDetails,
  loadMovementForUpdate,
  listInventorySettings,
} from '../../utils/inventory-helpers.js';
import {
  buildMovimientosReportPdf,
  buildMovimientoDetallePdf,
  buildExistenciasReportPdf,
  buildMovimientosReportPdfFileName,
  buildMovimientoDetallePdfFileName,
  buildExistenciasReportPdfFileName,
} from '../../utils/inventario-report-pdf.js';
import {
  buildMovimientosReportExcel,
  buildMovimientoDetalleExcel,
  buildExistenciasReportExcel,
  buildMovimientosReportExcelFileName,
  buildMovimientoDetalleExcelFileName,
  buildExistenciasReportExcelFileName,
} from '../../utils/inventario-report-excel.js';
import { formatDateTimeEs, todayIsoDate } from '../../utils/app-timezone.js';
import {
  getInventoryMovementSettings,
  isTransferMovementCode,
  isTransferOutCode,
  isSaleOutCode,
  assertMovementTypeCode,
  MOVEMENT_SETTING_KEYS,
} from '../../utils/inventory-movement-config.js';
import { createInvoiceFromMovement } from '../../utils/inventory-invoice.js';

const router = Router();

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function assertWarehouse(companyId, warehouseId) {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_warehouses WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [warehouseId, companyId]
  );
  if (!rows[0]) throw Object.assign(new Error('Bodega no encontrada'), { status: 404 });
  return rows[0];
}

async function assertMovementType(companyId, movementTypeId) {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_movement_types WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [movementTypeId, companyId]
  );
  if (!rows[0]) throw Object.assign(new Error('Tipo de movimiento no encontrado'), { status: 404 });
  return rows[0];
}

async function assertClient(companyId, clientId) {
  const { rows } = await pool.query(
    `SELECT * FROM clients WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [clientId, companyId],
  );
  if (!rows[0]) throw Object.assign(new Error('Tercero no encontrado en clientes'), { status: 404 });
  return formatClient(rows[0]);
}

function movementNeedsThirdParty(code, settings) {
  return !isTransferMovementCode(code, settings);
}

async function assertArticle(companyId, articleId) {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_articles WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [articleId, companyId]
  );
  if (!rows[0]) throw Object.assign(new Error('Artículo no encontrado'), { status: 404 });
  return rows[0];
}

function validateLines(lines, direction) {
  if (!Array.isArray(lines) || !lines.length) {
    throw Object.assign(new Error('Agregue al menos una línea al movimiento'), { status: 400 });
  }
  for (const line of lines) {
    const qty = round4(line.quantity);
    if (!line.articleId || qty <= 0) {
      throw Object.assign(new Error('Cada línea requiere artículo y cantidad mayor a cero'), { status: 400 });
    }
    if (direction === 'salida' && !line.lotId) {
      throw Object.assign(new Error('Las salidas requieren lote en cada línea'), { status: 400 });
    }
    if (direction === 'entrada') {
      const cost = round4(line.unitCost);
      if (cost <= 0) {
        throw Object.assign(new Error('Las entradas requieren costo de compra en cada línea'), { status: 400 });
      }
    }
  }
}

async function resolveThirdPartyFields(companyId, movementTypeCode, clientId, settings) {
  if (!movementNeedsThirdParty(movementTypeCode, settings)) {
    return { thirdPartyName: null, thirdPartyDocument: null, clientId: null };
  }
  if (!clientId) {
    throw Object.assign(new Error('Seleccione un tercero de la lista de clientes'), { status: 400 });
  }
  const thirdParty = await assertClient(companyId, clientId);
  return {
    thirdPartyName: thirdParty.fullName,
    thirdPartyDocument: thirdParty.documentDisplay || thirdParty.documentNumber,
    clientId,
  };
}

async function validateExitStock(client, companyId, warehouseId, lines) {
  const lotUsage = new Map();

  for (const line of lines) {
    const qty = round4(line.quantity);
    const whId = line.warehouseId || warehouseId;
    const key = `${whId}:${line.lotId}`;

    const { rows } = await client.query(
      `SELECT b.quantity_on_hand, a.code
       FROM inventory_lot_balances b
       JOIN inventory_articles a ON a.id = b.article_id
       WHERE b.company_id = $1 AND b.warehouse_id = $2 AND b.article_id = $3 AND b.lot_id = $4`,
      [companyId, whId, line.articleId, line.lotId],
    );

    if (!rows[0]) {
      throw Object.assign(new Error('No hay existencia del lote seleccionado'), { status: 400 });
    }

    const available = Number(rows[0].quantity_on_hand);
    const used = (lotUsage.get(key) || 0) + qty;
    lotUsage.set(key, used);

    if (used > available) {
      throw Object.assign(
        new Error(`Stock insuficiente para ${rows[0].code}. Disponible: ${available}`),
        { status: 400 },
      );
    }
  }
}

async function normalizeMovementLines(client, companyId, warehouseId, lines, direction, options = {}) {
  if (direction === 'salida') {
    await validateExitStock(client, companyId, warehouseId, lines);
  }

  const normalized = [];
  let totalQuantity = 0;
  let totalValue = 0;

  for (const line of lines) {
    const article = await assertArticle(companyId, line.articleId);
    const qty = round4(line.quantity);
    let unitCost = direction === 'entrada' ? round4(line.unitCost) : 0;

    if (direction === 'salida' && options.isSaleOut) {
      const salePrice = round4(line.unitPrice ?? line.unitCost);
      if (salePrice <= 0) {
        throw Object.assign(
          new Error(`Indique precio de venta mayor a cero para ${article.code}`),
          { status: 400 },
        );
      }
      unitCost = salePrice;
    } else if (direction === 'salida' && line.lotId) {
      const { rows } = await client.query(
        `SELECT purchase_unit_cost FROM inventory_lot_balances
         WHERE company_id = $1 AND warehouse_id = $2 AND article_id = $3 AND lot_id = $4`,
        [companyId, line.warehouseId || warehouseId, line.articleId, line.lotId],
      );
      if (rows[0]) unitCost = round4(rows[0].purchase_unit_cost);
    }

    const totalCost = round2(qty * unitCost);
    totalQuantity += qty;
    totalValue += totalCost;
    normalized.push({
      articleId: line.articleId,
      lotId: line.lotId || null,
      warehouseId: line.warehouseId || warehouseId,
      quantity: qty,
      unitCost,
      totalCost,
      supplierLotNumber: line.supplierLotNumber?.trim() || null,
      expiryDate: line.expiryDate || null,
      notes: line.notes?.trim() || null,
    });
  }

  return {
    normalized,
    totalQuantity: round4(totalQuantity),
    totalValue: round2(totalValue),
  };
}

async function insertMovementDetails(client, movementId, normalizedLines) {
  let lineNum = 0;
  for (const line of normalizedLines) {
    lineNum += 1;
    await client.query(
      `INSERT INTO inventory_movement_details (
         movement_id, line_number, article_id, lot_id, warehouse_id,
         quantity, unit_cost, total_cost, supplier_lot_number, expiry_date, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        movementId,
        lineNum,
        line.articleId,
        line.lotId,
        line.warehouseId,
        line.quantity,
        line.unitCost,
        line.totalCost,
        line.supplierLotNumber,
        line.expiryDate,
        line.notes,
      ],
    );
  }
}

async function fetchMovementHeader(companyId, movementId) {
  const { rows } = await pool.query(
    `SELECT m.*,
            w.name AS warehouse_name,
            tw.name AS target_warehouse_name,
            mt.code AS movement_type_code,
            mt.name AS movement_type_name,
            mt.direction,
            u.full_name AS created_by_name,
            inv.full_number AS invoice_full_number,
            inv.internal_number AS invoice_internal_number,
            inv.document_kind AS invoice_document_kind
     FROM inventory_movements m
     JOIN inventory_warehouses w ON w.id = m.warehouse_id
     LEFT JOIN inventory_warehouses tw ON tw.id = m.target_warehouse_id
     JOIN inventory_movement_types mt ON mt.id = m.movement_type_id
     LEFT JOIN users u ON u.id = m.created_by
     LEFT JOIN invoices inv ON inv.id = m.invoice_id
     WHERE m.id = $1 AND m.company_id = $2`,
    [movementId, companyId]
  );
  return rows[0];
}

async function loadCompanyForReport(companyId) {
  const { rows } = await pool.query(
    `SELECT name, nit, address, phone, logo_path FROM companies WHERE id = $1`,
    [companyId],
  );
  const c = rows[0] || {};
  return {
    name: c.name,
    nit: c.nit,
    address: c.address,
    phone: c.phone,
    logoPath: c.logo_path,
  };
}

async function loadMovementsForReport(companyId, { warehouseId, status }) {
  const values = [companyId];
  let sql = `
    SELECT m.*,
           w.name AS warehouse_name,
           tw.name AS target_warehouse_name,
           mt.code AS movement_type_code,
           mt.name AS movement_type_name,
           mt.direction
    FROM inventory_movements m
    JOIN inventory_warehouses w ON w.id = m.warehouse_id
    LEFT JOIN inventory_warehouses tw ON tw.id = m.target_warehouse_id
    JOIN inventory_movement_types mt ON mt.id = m.movement_type_id
    WHERE m.company_id = $1
  `;
  if (warehouseId) {
    values.push(warehouseId);
    sql += ` AND m.warehouse_id = $${values.length}`;
  }
  if (status) {
    values.push(status);
    sql += ` AND m.status = $${values.length}`;
  }
  sql += ' ORDER BY m.movement_date DESC, m.created_at DESC LIMIT 500';
  const { rows } = await pool.query(sql, values);
  return rows.map((r) => formatMovement(r));
}

async function loadBalancesForReport(companyId, { warehouseId, articleId }) {
  const values = [companyId];
  let sql = `
    SELECT b.*,
           w.code AS warehouse_code, w.name AS warehouse_name,
           a.code AS article_code, a.name AS article_name,
           l.internal_lot_number, l.supplier_lot_number, l.expiry_date
    FROM inventory_lot_balances b
    JOIN inventory_warehouses w ON w.id = b.warehouse_id
    JOIN inventory_articles a ON a.id = b.article_id
    JOIN inventory_lots l ON l.id = b.lot_id
    WHERE b.company_id = $1 AND b.quantity_on_hand > 0
  `;
  if (warehouseId) {
    values.push(warehouseId);
    sql += ` AND b.warehouse_id = $${values.length}`;
  }
  if (articleId) {
    values.push(articleId);
    sql += ` AND b.article_id = $${values.length}`;
  }
  sql += ' ORDER BY w.name, a.code, l.expiry_date';
  const { rows } = await pool.query(sql, values);
  return rows.map(formatBalance);
}

async function buildReportFilters(companyId, query, type) {
  const filters = [`Generado: ${formatDateTimeEs(new Date())}`];
  if (query.warehouseId) {
    const { rows } = await pool.query(
      `SELECT code, name FROM inventory_warehouses WHERE id = $1 AND company_id = $2`,
      [query.warehouseId, companyId],
    );
    if (rows[0]) filters.push(`Bodega: ${rows[0].code} — ${rows[0].name}`);
  } else {
    filters.push('Bodega: Todas');
  }
  if (type === 'movements' && query.status) {
    const labels = { borrador: 'Borrador', confirmado: 'Confirmado', anulado: 'Anulado' };
    filters.push(`Estado: ${labels[query.status] || query.status}`);
  }
  if (type === 'balances' && query.articleId) {
    const { rows } = await pool.query(
      `SELECT code, name FROM inventory_articles WHERE id = $1 AND company_id = $2`,
      [query.articleId, companyId],
    );
    if (rows[0]) filters.push(`Artículo: ${rows[0].code} — ${rows[0].name}`);
  }
  return filters;
}

function sendExportFile(res, req, buffer, fileName, contentType) {
  const forceDownload = req.query.download === '1' || req.query.download === 'true';
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Download-Filename', fileName);
  res.setHeader(
    'Content-Disposition',
    `${forceDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
  );
  res.send(buffer);
}

// --- Bodegas ---
router.get('/warehouses', requirePermission('inventario.acceso', 'inventario.bodegas'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_warehouses WHERE company_id = $1 ORDER BY is_default DESC, name`,
    [req.user.companyId]
  );
  res.json(rows.map(formatWarehouse));
});

router.post('/warehouses', requirePermission('inventario.bodegas'), async (req, res) => {
  const { code, name, documentPrefix, address, isDefault } = req.body;
  if (!code?.trim() || !name?.trim() || !documentPrefix?.trim()) {
    return res.status(400).json({ error: 'Código, nombre y prefijo documental son requeridos' });
  }
  const prefix = String(documentPrefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (prefix.length < 2) {
    return res.status(400).json({ error: 'El prefijo debe tener al menos 2 caracteres alfanuméricos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isDefault) {
      await client.query(
        `UPDATE inventory_warehouses SET is_default = false WHERE company_id = $1`,
        [req.user.companyId]
      );
    }
    const { rows } = await client.query(
      `INSERT INTO inventory_warehouses (company_id, code, name, document_prefix, address, is_default)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.companyId, code.trim().toUpperCase(), name.trim(), prefix, address?.trim() || null, Boolean(isDefault)]
    );
    await client.query('COMMIT');
    res.status(201).json(formatWarehouse(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Código o prefijo ya registrado' });
    throw err;
  } finally {
    client.release();
  }
});

router.put('/warehouses/:id', requirePermission('inventario.bodegas'), async (req, res) => {
  const { name, documentPrefix, address, isDefault, isActive } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (isDefault) {
      await client.query(
        `UPDATE inventory_warehouses SET is_default = false WHERE company_id = $1`,
        [req.user.companyId]
      );
    }
    const prefix = documentPrefix != null
      ? String(documentPrefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
      : null;
    const { rows } = await client.query(
      `UPDATE inventory_warehouses SET
         name = COALESCE($1, name),
         document_prefix = COALESCE($2, document_prefix),
         address = COALESCE($3, address),
         is_default = COALESCE($4, is_default),
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE id = $6 AND company_id = $7
       RETURNING *`,
      [
        name?.trim() || null,
        prefix,
        address !== undefined ? (address?.trim() || null) : null,
        isDefault !== undefined ? Boolean(isDefault) : null,
        isActive !== undefined ? Boolean(isActive) : null,
        req.params.id,
        req.user.companyId,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Bodega no encontrada' });
    await client.query('COMMIT');
    res.json(formatWarehouse(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Prefijo ya registrado' });
    throw err;
  } finally {
    client.release();
  }
});

// --- Tipos artículo ---
router.get('/article-types', requirePermission('inventario.acceso', 'inventario.catalogos'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_article_types WHERE company_id = $1 ORDER BY name`,
    [req.user.companyId]
  );
  res.json(rows.map(formatArticleType));
});

router.post('/article-types', requirePermission('inventario.catalogos'), async (req, res) => {
  const { code, name, description } = req.body;
  if (!code?.trim() || !name?.trim()) {
    return res.status(400).json({ error: 'Código y nombre requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO inventory_article_types (company_id, code, name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.companyId, code.trim().toUpperCase(), name.trim(), description?.trim() || null]
    );
    res.status(201).json(formatArticleType(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Código ya registrado' });
    throw err;
  }
});

router.put('/article-types/:id', requirePermission('inventario.catalogos'), async (req, res) => {
  const { name, description, isActive } = req.body;
  const { rows } = await pool.query(
    `UPDATE inventory_article_types SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       is_active = COALESCE($3, is_active),
       updated_at = NOW()
     WHERE id = $4 AND company_id = $5
     RETURNING *`,
    [name?.trim() || null, description?.trim() || null, isActive !== undefined ? Boolean(isActive) : null, req.params.id, req.user.companyId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Tipo no encontrado' });
  res.json(formatArticleType(rows[0]));
});

// --- Tipos movimiento (lectura) ---
router.get('/movement-types', requirePermission('inventario.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM inventory_movement_types WHERE company_id = $1 AND is_active = true ORDER BY sort_order, code`,
    [req.user.companyId]
  );
  res.json(rows.map(formatMovementType));
});

// --- Artículos ---
router.get('/articles/next-code', requirePermission('inventario.articulos'), async (req, res) => {
  res.json(await peekNextArticleCode(pool, req.user.companyId));
});

router.get('/articles', requirePermission('inventario.acceso', 'inventario.articulos'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, t.name AS article_type_name
     FROM inventory_articles a
     LEFT JOIN inventory_article_types t ON t.id = a.article_type_id
     WHERE a.company_id = $1
     ORDER BY a.code`,
    [req.user.companyId]
  );
  res.json(rows.map(formatArticle));
});

router.post('/articles', requirePermission('inventario.articulos'), async (req, res) => {
  const b = req.body;
  if (!b.name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  let code = b.code?.trim().toUpperCase();
  if (!code) {
    code = (await peekNextArticleCode(pool, req.user.companyId)).nextCode;
  }
  const { rows } = await pool.query(
    `INSERT INTO inventory_articles (
       company_id, article_type_id, code, name, description, unit_of_measure,
       without_supplier_lot, requires_expiry_date, default_expiry_days,
       min_stock, max_stock, barcode
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      req.user.companyId,
      b.articleTypeId || null,
      code,
      b.name.trim(),
      b.description?.trim() || null,
      b.unitOfMeasure?.trim() || 'UND',
      Boolean(b.withoutSupplierLot),
      Boolean(b.requiresExpiryDate),
      Number(b.defaultExpiryDays) || 730,
      b.minStock != null ? round4(b.minStock) : null,
      b.maxStock != null ? round4(b.maxStock) : null,
      b.barcode?.trim() || null,
    ]
  );
  res.status(201).json(formatArticle(rows[0]));
});

router.put('/articles/:id', requirePermission('inventario.articulos'), async (req, res) => {
  const b = req.body;
  const { rows } = await pool.query(
    `UPDATE inventory_articles SET
       article_type_id = COALESCE($1, article_type_id),
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       unit_of_measure = COALESCE($4, unit_of_measure),
       without_supplier_lot = COALESCE($5, without_supplier_lot),
       requires_expiry_date = COALESCE($6, requires_expiry_date),
       default_expiry_days = COALESCE($7, default_expiry_days),
       min_stock = COALESCE($8, min_stock),
       max_stock = COALESCE($9, max_stock),
       barcode = COALESCE($10, barcode),
       is_active = COALESCE($11, is_active),
       updated_at = NOW()
     WHERE id = $12 AND company_id = $13
     RETURNING *`,
    [
      b.articleTypeId !== undefined ? b.articleTypeId : null,
      b.name?.trim() || null,
      b.description !== undefined ? (b.description?.trim() || null) : null,
      b.unitOfMeasure?.trim() || null,
      b.withoutSupplierLot !== undefined ? Boolean(b.withoutSupplierLot) : null,
      b.requiresExpiryDate !== undefined ? Boolean(b.requiresExpiryDate) : null,
      b.defaultExpiryDays != null ? Number(b.defaultExpiryDays) : null,
      b.minStock !== undefined ? (b.minStock != null ? round4(b.minStock) : null) : null,
      b.maxStock !== undefined ? (b.maxStock != null ? round4(b.maxStock) : null) : null,
      b.barcode !== undefined ? (b.barcode?.trim() || null) : null,
      b.isActive !== undefined ? Boolean(b.isActive) : null,
      req.params.id,
      req.user.companyId,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Artículo no encontrado' });
  res.json(formatArticle(rows[0]));
});

// --- Existencias ---
router.get('/balances', requirePermission('inventario.acceso'), async (req, res) => {
  const { warehouseId, articleId } = req.query;
  const values = [req.user.companyId];
  let sql = `
    SELECT b.*,
           w.code AS warehouse_code, w.name AS warehouse_name,
           a.code AS article_code, a.name AS article_name,
           l.internal_lot_number, l.supplier_lot_number, l.expiry_date
    FROM inventory_lot_balances b
    JOIN inventory_warehouses w ON w.id = b.warehouse_id
    JOIN inventory_articles a ON a.id = b.article_id
    JOIN inventory_lots l ON l.id = b.lot_id
    WHERE b.company_id = $1 AND b.quantity_on_hand > 0
  `;
  if (warehouseId) {
    values.push(warehouseId);
    sql += ` AND b.warehouse_id = $${values.length}`;
  }
  if (articleId) {
    values.push(articleId);
    sql += ` AND b.article_id = $${values.length}`;
  }
  sql += ' ORDER BY w.name, a.code, l.expiry_date';
  const { rows } = await pool.query(sql, values);
  res.json(rows.map(formatBalance));
});

router.get('/balances/export-pdf', requirePermission('inventario.acceso'), async (req, res) => {
  try {
    const company = await loadCompanyForReport(req.user.companyId);
    const filters = await buildReportFilters(req.user.companyId, req.query, 'balances');
    const balances = await loadBalancesForReport(req.user.companyId, req.query);
    const pdfBuffer = await buildExistenciasReportPdf({ company, filters, balances });
    sendExportFile(res, req, pdfBuffer, buildExistenciasReportPdfFileName(), 'application/pdf');
  } catch (err) {
    console.error('[inventario-existencias-pdf]', err);
    res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
  }
});

router.get('/balances/export-excel', requirePermission('inventario.acceso'), async (req, res) => {
  try {
    const company = await loadCompanyForReport(req.user.companyId);
    const filters = await buildReportFilters(req.user.companyId, req.query, 'balances');
    const balances = await loadBalancesForReport(req.user.companyId, req.query);
    const excelBuffer = await buildExistenciasReportExcel({ company, filters, balances });
    sendExportFile(
      res,
      req,
      excelBuffer,
      buildExistenciasReportExcelFileName(),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  } catch (err) {
    console.error('[inventario-existencias-excel]', err);
    res.status(500).json({ error: `No se pudo generar Excel: ${err.message}` });
  }
});

// --- Variables ---
router.get('/movement-config', requirePermission('inventario.acceso', 'inventario.movimientos'), async (req, res) => {
  res.json(await getInventoryMovementSettings(pool, req.user.companyId));
});

router.get('/settings', requirePermission('inventario.acceso', 'inventario.variables'), async (req, res) => {
  res.json(await listInventorySettings(pool, req.user.companyId));
});

router.put('/settings/:key', requirePermission('inventario.variables'), async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!key.startsWith('inventory.')) {
    return res.status(400).json({ error: 'Variable no válida' });
  }
  if (key === 'inventory.valuation_method') {
    const v = String(req.body.value || '').trim().toLowerCase();
    if (!['average', 'purchase'].includes(v)) {
      return res.status(400).json({ error: 'Valor debe ser average o purchase' });
    }
  }
  const movementTypeKeys = [
    MOVEMENT_SETTING_KEYS.transferOut,
    MOVEMENT_SETTING_KEYS.transferIn,
    MOVEMENT_SETTING_KEYS.saleOut,
  ];
  if (movementTypeKeys.includes(key)) {
    try {
      req.body.value = await assertMovementTypeCode(pool, req.user.companyId, req.body.value);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }
  const row = await setCompanyVariable(pool, req.user.companyId, key, req.body.value);
  res.json(row);
});

// --- Catálogo clientes (terceros) ---
router.get('/catalog/clients', requirePermission('inventario.movimientos'), async (req, res) => {
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
    const lookup = await lookupDianAcquirer(req.user.companyId, documentType, documentNumber);
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

// --- Movimientos ---
router.get('/movements', requirePermission('inventario.acceso', 'inventario.movimientos'), async (req, res) => {
  const values = [req.user.companyId];
  let sql = `
    SELECT m.*,
           w.name AS warehouse_name,
           tw.name AS target_warehouse_name,
           mt.code AS movement_type_code,
           mt.name AS movement_type_name,
           mt.direction
    FROM inventory_movements m
    JOIN inventory_warehouses w ON w.id = m.warehouse_id
    LEFT JOIN inventory_warehouses tw ON tw.id = m.target_warehouse_id
    JOIN inventory_movement_types mt ON mt.id = m.movement_type_id
    WHERE m.company_id = $1
  `;
  if (req.query.warehouseId) {
    values.push(req.query.warehouseId);
    sql += ` AND m.warehouse_id = $${values.length}`;
  }
  if (req.query.status) {
    values.push(req.query.status);
    sql += ` AND m.status = $${values.length}`;
  }
  sql += ' ORDER BY m.movement_date DESC, m.created_at DESC LIMIT 200';
  const { rows } = await pool.query(sql, values);
  res.json(rows.map((r) => formatMovement(r)));
});

router.get('/movements/export-pdf', requirePermission('inventario.acceso', 'inventario.movimientos'), async (req, res) => {
  try {
    const company = await loadCompanyForReport(req.user.companyId);
    const filters = await buildReportFilters(req.user.companyId, req.query, 'movements');
    const movements = await loadMovementsForReport(req.user.companyId, req.query);
    const pdfBuffer = await buildMovimientosReportPdf({ company, filters, movements });
    sendExportFile(res, req, pdfBuffer, buildMovimientosReportPdfFileName(), 'application/pdf');
  } catch (err) {
    console.error('[inventario-movimientos-pdf]', err);
    res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
  }
});

router.get('/movements/export-excel', requirePermission('inventario.acceso', 'inventario.movimientos'), async (req, res) => {
  try {
    const company = await loadCompanyForReport(req.user.companyId);
    const filters = await buildReportFilters(req.user.companyId, req.query, 'movements');
    const movements = await loadMovementsForReport(req.user.companyId, req.query);
    const excelBuffer = await buildMovimientosReportExcel({ company, filters, movements });
    sendExportFile(
      res,
      req,
      excelBuffer,
      buildMovimientosReportExcelFileName(),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  } catch (err) {
    console.error('[inventario-movimientos-excel]', err);
    res.status(500).json({ error: `No se pudo generar Excel: ${err.message}` });
  }
});

router.get('/movements/:id/pdf', requirePermission('inventario.acceso', 'inventario.movimientos'), async (req, res) => {
  const header = await fetchMovementHeader(req.user.companyId, req.params.id);
  if (!header) return res.status(404).json({ error: 'Movimiento no encontrado' });
  const details = await loadMovementDetails(pool, req.params.id);
  const movement = formatMovement(header, details);
  try {
    const company = await loadCompanyForReport(req.user.companyId);
    const pdfBuffer = await buildMovimientoDetallePdf({ company, movement });
    sendExportFile(res, req, pdfBuffer, buildMovimientoDetallePdfFileName(movement), 'application/pdf');
  } catch (err) {
    console.error('[inventario-movimiento-pdf]', err);
    res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
  }
});

router.get('/movements/:id/excel', requirePermission('inventario.acceso', 'inventario.movimientos'), async (req, res) => {
  const header = await fetchMovementHeader(req.user.companyId, req.params.id);
  if (!header) return res.status(404).json({ error: 'Movimiento no encontrado' });
  const details = await loadMovementDetails(pool, req.params.id);
  const movement = formatMovement(header, details);
  try {
    const company = await loadCompanyForReport(req.user.companyId);
    const excelBuffer = await buildMovimientoDetalleExcel({ company, movement });
    sendExportFile(
      res,
      req,
      excelBuffer,
      buildMovimientoDetalleExcelFileName(movement),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  } catch (err) {
    console.error('[inventario-movimiento-excel]', err);
    res.status(500).json({ error: `No se pudo generar Excel: ${err.message}` });
  }
});

router.get('/movements/:id', requirePermission('inventario.acceso', 'inventario.movimientos'), async (req, res) => {
  const header = await fetchMovementHeader(req.user.companyId, req.params.id);
  if (!header) return res.status(404).json({ error: 'Movimiento no encontrado' });
  const details = await loadMovementDetails(pool, req.params.id);
  res.json(formatMovement(header, details));
});

router.post('/movements', requirePermission('inventario.movimientos'), async (req, res) => {
  const b = req.body;
  await assertWarehouse(req.user.companyId, b.warehouseId);
  const mType = await assertMovementType(req.user.companyId, b.movementTypeId);
  const movSettings = await getInventoryMovementSettings(pool, req.user.companyId);
  if (isTransferOutCode(mType.code, movSettings)) {
    if (!b.targetWarehouseId) {
      return res.status(400).json({ error: 'Indique la bodega destino para traslados' });
    }
    await assertWarehouse(req.user.companyId, b.targetWarehouseId);
  }
  validateLines(b.lines, mType.direction);

  let thirdPartyName;
  let thirdPartyDocument;
  let clientId;
  try {
    ({ thirdPartyName, thirdPartyDocument, clientId } = await resolveThirdPartyFields(
      req.user.companyId,
      mType.code,
      b.clientId,
      movSettings,
    ));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const docNumber = await allocateDocumentNumber(client, req.user.companyId, b.warehouseId, b.movementTypeId);
    const { normalized, totalQuantity, totalValue } = await normalizeMovementLines(
      client,
      req.user.companyId,
      b.warehouseId,
      b.lines,
      mType.direction,
      { isSaleOut: isSaleOutCode(mType.code, movSettings) },
    );
    const { rows } = await client.query(
      `INSERT INTO inventory_movements (
         company_id, warehouse_id, target_warehouse_id, movement_type_id,
         document_number, movement_date, client_id, third_party_name, third_party_document,
         reference_number, notes, total_quantity, total_value, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        req.user.companyId,
        b.warehouseId,
        b.targetWarehouseId || null,
        b.movementTypeId,
        docNumber,
        b.movementDate || todayIsoDate(),
        clientId,
        thirdPartyName,
        thirdPartyDocument,
        b.referenceNumber?.trim() || null,
        b.notes?.trim() || null,
        totalQuantity,
        totalValue,
        req.user.userId,
      ],
    );
    const movement = rows[0];
    await insertMovementDetails(client, movement.id, normalized);
    await client.query('COMMIT');
    const header = await fetchMovementHeader(req.user.companyId, movement.id);
    const details = await loadMovementDetails(pool, movement.id);
    res.status(201).json(formatMovement(header, details));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/movements/:id', requirePermission('inventario.movimientos'), async (req, res) => {
  const b = req.body;
  const existing = await loadMovementForUpdate(pool, req.user.companyId, req.params.id);
  if (existing.status !== 'borrador') {
    return res.status(400).json({ error: 'Solo se pueden editar movimientos en borrador' });
  }

  await assertWarehouse(req.user.companyId, b.warehouseId);
  const mType = await assertMovementType(req.user.companyId, b.movementTypeId);
  const movSettings = await getInventoryMovementSettings(pool, req.user.companyId);
  if (isTransferOutCode(mType.code, movSettings)) {
    if (!b.targetWarehouseId) {
      return res.status(400).json({ error: 'Indique la bodega destino para traslados' });
    }
    await assertWarehouse(req.user.companyId, b.targetWarehouseId);
  }
  validateLines(b.lines, mType.direction);

  let thirdPartyName;
  let thirdPartyDocument;
  let clientId;
  try {
    ({ thirdPartyName, thirdPartyDocument, clientId } = await resolveThirdPartyFields(
      req.user.companyId,
      mType.code,
      b.clientId,
      movSettings,
    ));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { normalized, totalQuantity, totalValue } = await normalizeMovementLines(
      client,
      req.user.companyId,
      b.warehouseId,
      b.lines,
      mType.direction,
      { isSaleOut: isSaleOutCode(mType.code, movSettings) },
    );
    await client.query(
      `UPDATE inventory_movements SET
         warehouse_id = $1,
         target_warehouse_id = $2,
         movement_type_id = $3,
         movement_date = $4,
         client_id = $5,
         third_party_name = $6,
         third_party_document = $7,
         reference_number = $8,
         notes = $9,
         total_quantity = $10,
         total_value = $11,
         updated_at = NOW()
       WHERE id = $12 AND company_id = $13`,
      [
        b.warehouseId,
        b.targetWarehouseId || null,
        b.movementTypeId,
        b.movementDate || todayIsoDate(),
        clientId,
        thirdPartyName,
        thirdPartyDocument,
        b.referenceNumber?.trim() || null,
        b.notes?.trim() || null,
        totalQuantity,
        totalValue,
        req.params.id,
        req.user.companyId,
      ],
    );
    await client.query('DELETE FROM inventory_movement_details WHERE movement_id = $1', [req.params.id]);
    await insertMovementDetails(client, req.params.id, normalized);
    await client.query('COMMIT');
    const header = await fetchMovementHeader(req.user.companyId, req.params.id);
    const details = await loadMovementDetails(pool, req.params.id);
    res.json(formatMovement(header, details));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/movements/:id/confirm', requirePermission('inventario.confirmar'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await confirmInventoryMovement(client, req.user.companyId, req.params.id, req.user.userId);
    await client.query('COMMIT');
    const header = await fetchMovementHeader(req.user.companyId, req.params.id);
    const details = await loadMovementDetails(pool, req.params.id);
    res.json({ ...formatMovement(header, details), ...result });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/movements/:id/void', requirePermission('inventario.anular'), async (req, res) => {
  const movement = await loadMovementForUpdate(pool, req.user.companyId, req.params.id);
  if (movement.status === 'anulado') {
    return res.status(400).json({ error: 'El movimiento ya está anulado' });
  }
  if (movement.status === 'confirmado') {
    return res.status(400).json({ error: 'Anular movimientos confirmados estará disponible próximamente' });
  }
  const { rows } = await pool.query(
    `UPDATE inventory_movements
     SET status = 'anulado', voided_by = $1, voided_at = NOW(), void_reason = $2, updated_at = NOW()
     WHERE id = $3 AND company_id = $4
     RETURNING *`,
    [req.user.userId, req.body.reason?.trim() || null, req.params.id, req.user.companyId]
  );
  res.json(formatMovement(rows[0]));
});

router.post('/movements/:id/create-invoice', requirePermission('inventario.movimientos', 'ventas.cotizar'), async (req, res) => {
  const movSettings = await getInventoryMovementSettings(pool, req.user.companyId);
  const header = await fetchMovementHeader(req.user.companyId, req.params.id);
  if (!header) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (header.status === 'anulado') {
    return res.status(400).json({ error: 'No se puede facturar un movimiento anulado' });
  }
  if (header.status !== 'confirmado') {
    return res.status(400).json({ error: 'Solo se puede generar factura en movimientos confirmados' });
  }
  if (!isSaleOutCode(header.movement_type_code, movSettings)) {
    return res.status(400).json({ error: 'Solo los movimientos de salida por venta pueden generar factura' });
  }
  if (header.invoice_id) {
    return res.status(400).json({ error: 'Este movimiento ya tiene un documento de venta vinculado' });
  }

  const { dianResolutionId, emit, taxRate, notes } = req.body;
  if (dianResolutionId && !(await hasPermission(req.user, 'ventas.facturar'))) {
    return res.status(403).json({ error: 'No tiene permiso para emitir facturas DIAN' });
  }

  const { rows: detailRows } = await pool.query(
    `SELECT d.*, a.code AS article_code, a.name AS article_name
     FROM inventory_movement_details d
     JOIN inventory_articles a ON a.id = d.article_id
     WHERE d.movement_id = $1
     ORDER BY d.line_number`,
    [req.params.id],
  );

  let movementForInvoice = { ...header };
  if (!movementForInvoice.client_id && movementForInvoice.third_party_document) {
    const doc = String(movementForInvoice.third_party_document).replace(/\D/g, '');
    const { rows: clientRows } = await pool.query(
      `SELECT id FROM clients
       WHERE company_id = $1 AND is_active = true
         AND (document_number = $2 OR CONCAT(document_number, COALESCE(verification_digit, '')) = $2)
       LIMIT 1`,
      [req.user.companyId, doc],
    );
    if (clientRows[0]) {
      movementForInvoice.client_id = clientRows[0].id;
      await pool.query(
        `UPDATE inventory_movements SET client_id = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`,
        [clientRows[0].id, req.params.id, req.user.companyId],
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invoice = await createInvoiceFromMovement(client, {
      companyId: req.user.companyId,
      userId: req.user.userId,
      movement: movementForInvoice,
      details: detailRows,
      dianResolutionId: dianResolutionId || null,
      emit: emit === true,
      taxRate: taxRate ?? 19,
      notes,
    });
    await client.query('COMMIT');
    const updatedHeader = await fetchMovementHeader(req.user.companyId, req.params.id);
    const details = await loadMovementDetails(pool, req.params.id);
    res.status(201).json({
      movement: formatMovement(updatedHeader, details),
      invoice: {
        id: invoice.id,
        documentKind: invoice.document_kind,
        internalNumber: invoice.internal_number,
        fullNumber: invoice.full_number,
        status: invoice.status,
        total: Number(invoice.total),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

export default router;
