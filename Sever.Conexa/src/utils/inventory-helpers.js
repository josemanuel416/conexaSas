import { getCompanyVariable } from './company-settings.js';
import { todayIsoDate } from './app-timezone.js';
import {
  getInventoryMovementSettings,
  isTransferOutCode,
  MOVEMENT_SETTING_KEYS,
} from './inventory-movement-config.js';

const ARTICLE_CODE_PAD = 4;
const INTERNAL_LOT_PAD = 6;
const DOC_NUMBER_PAD = 6;

export function normalizeInventoryPrefix(value, min = 2, max = 10) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max)
    .padEnd(min, 'X')
    .slice(0, max);
}

export function formatWarehouse(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    documentPrefix: row.document_prefix,
    address: row.address,
    isDefault: row.is_default,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatArticleType(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
  };
}

export function formatMovementType(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    direction: row.direction,
    description: row.description,
    isSystem: row.is_system,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

export function formatArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    articleTypeId: row.article_type_id,
    articleTypeName: row.article_type_name || null,
    unitOfMeasure: row.unit_of_measure,
    withoutSupplierLot: row.without_supplier_lot,
    requiresExpiryDate: row.requires_expiry_date,
    defaultExpiryDays: row.default_expiry_days,
    averageCost: Number(row.average_cost),
    minStock: row.min_stock != null ? Number(row.min_stock) : null,
    maxStock: row.max_stock != null ? Number(row.max_stock) : null,
    barcode: row.barcode,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatLot(row) {
  if (!row) return null;
  return {
    id: row.id,
    articleId: row.article_id,
    articleCode: row.article_code || null,
    articleName: row.article_name || null,
    internalLotNumber: row.internal_lot_number,
    supplierLotNumber: row.supplier_lot_number,
    manufacturingDate: row.manufacturing_date,
    expiryDate: row.expiry_date,
    notes: row.notes,
    isActive: row.is_active,
  };
}

export function formatBalance(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code || null,
    warehouseName: row.warehouse_name || null,
    articleId: row.article_id,
    articleCode: row.article_code || null,
    articleName: row.article_name || null,
    lotId: row.lot_id,
    internalLotNumber: row.internal_lot_number || null,
    supplierLotNumber: row.supplier_lot_number || null,
    expiryDate: row.expiry_date || null,
    quantityOnHand: Number(row.quantity_on_hand),
    purchaseUnitCost: Number(row.purchase_unit_cost),
    totalValue: Number(row.quantity_on_hand) * Number(row.purchase_unit_cost),
  };
}

export function formatMovement(row, details = []) {
  if (!row) return null;
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name || null,
    targetWarehouseId: row.target_warehouse_id,
    targetWarehouseName: row.target_warehouse_name || null,
    movementTypeId: row.movement_type_id,
    movementTypeCode: row.movement_type_code || null,
    movementTypeName: row.movement_type_name || null,
    direction: row.direction || null,
    relatedMovementId: row.related_movement_id,
    documentNumber: row.document_number,
    movementDate: row.movement_date,
    status: row.status,
    clientId: row.client_id || null,
    thirdPartyName: row.third_party_name,
    thirdPartyDocument: row.third_party_document,
    invoiceId: row.invoice_id || null,
    invoiceFullNumber: row.invoice_full_number || null,
    invoiceInternalNumber: row.invoice_internal_number || null,
    invoiceDocumentKind: row.invoice_document_kind || null,
    referenceNumber: row.reference_number,
    notes: row.notes,
    totalQuantity: Number(row.total_quantity),
    totalValue: Number(row.total_value),
    createdByName: row.created_by_name || null,
    confirmedAt: row.confirmed_at,
    details,
  };
}

export function formatMovementDetail(row) {
  if (!row) return null;
  return {
    id: row.id,
    lineNumber: row.line_number,
    articleId: row.article_id,
    articleCode: row.article_code || null,
    articleName: row.article_name || null,
    lotId: row.lot_id,
    internalLotNumber: row.internal_lot_number || null,
    supplierLotNumber: row.supplier_lot_number || null,
    expiryDate: row.expiry_date || null,
    warehouseId: row.warehouse_id,
    quantity: Number(row.quantity),
    unitCost: Number(row.unit_cost),
    totalCost: Number(row.total_cost),
    notes: row.notes,
  };
}

export async function peekNextArticleCode(db, companyId) {
  const rawPrefix = (await getCompanyVariable(db, companyId, 'inventory.articles.code_prefix')) || 'ART';
  const prefix = normalizeInventoryPrefix(rawPrefix, 2, 8);
  const pattern = `^${prefix}[0-9]{${ARTICLE_CODE_PAD}}$`;
  const { rows } = await db.query(
    `SELECT code FROM inventory_articles
     WHERE company_id = $1 AND code ~ $2
     ORDER BY code DESC LIMIT 1`,
    [companyId, pattern]
  );
  let next = 1;
  if (rows[0]) {
    next = parseInt(rows[0].code.slice(prefix.length), 10) + 1;
  }
  return {
    prefix,
    nextCode: `${prefix}${String(next).padStart(ARTICLE_CODE_PAD, '0')}`,
  };
}

export async function allocateInternalLotNumber(db, companyId) {
  const rawPrefix = (await getCompanyVariable(db, companyId, 'inventory.internal_lot_prefix')) || 'LT';
  const prefix = normalizeInventoryPrefix(rawPrefix, 2, 8);
  const { rows } = await db.query(
    `INSERT INTO inventory_internal_lot_sequences (company_id, last_consecutive)
     VALUES ($1, 1)
     ON CONFLICT (company_id) DO UPDATE
       SET last_consecutive = inventory_internal_lot_sequences.last_consecutive + 1,
           updated_at = NOW()
     RETURNING last_consecutive`,
    [companyId]
  );
  const seq = rows[0].last_consecutive;
  return `${prefix}${String(seq).padStart(INTERNAL_LOT_PAD, '0')}`;
}

export async function allocateDocumentNumber(db, companyId, warehouseId, movementTypeId) {
  const wh = await db.query(
    `SELECT document_prefix FROM inventory_warehouses WHERE id = $1 AND company_id = $2`,
    [warehouseId, companyId]
  );
  if (!wh.rows[0]) {
    throw Object.assign(new Error('Bodega no encontrada'), { status: 404 });
  }
  const mt = await db.query(
    `SELECT code FROM inventory_movement_types WHERE id = $1 AND company_id = $2`,
    [movementTypeId, companyId]
  );
  if (!mt.rows[0]) {
    throw Object.assign(new Error('Tipo de movimiento no encontrado'), { status: 404 });
  }

  const { rows } = await db.query(
    `INSERT INTO inventory_warehouse_sequences (company_id, warehouse_id, movement_type_id, last_consecutive)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (warehouse_id, movement_type_id) DO UPDATE
       SET last_consecutive = inventory_warehouse_sequences.last_consecutive + 1,
           updated_at = NOW()
     RETURNING last_consecutive`,
    [companyId, warehouseId, movementTypeId]
  );
  const seq = rows[0].last_consecutive;
  const prefix = wh.rows[0].document_prefix;
  const typeCode = mt.rows[0].code;
  return `${prefix}-${typeCode}-${String(seq).padStart(DOC_NUMBER_PAD, '0')}`;
}

function addDays(date, days) {
  const raw = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : todayIsoDate(date instanceof Date ? date : new Date(date));
  const d = new Date(`${raw}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function resolveExpiryDate(article, lineExpiry, movementDate) {
  if (article.requires_expiry_date) {
    if (!lineExpiry) {
      throw Object.assign(new Error(`El artículo ${article.code} requiere fecha de vencimiento`), { status: 400 });
    }
    return lineExpiry;
  }
  return addDays(movementDate || new Date(), article.default_expiry_days || 730);
}

export function resolveSupplierLot(article, supplierLot, internalLot) {
  if (article.without_supplier_lot) return internalLot;
  const trimmed = String(supplierLot || '').trim();
  if (!trimmed) {
    throw Object.assign(new Error(`Indique el lote del proveedor para ${article.code}`), { status: 400 });
  }
  return trimmed;
}

export async function loadMovementForUpdate(db, companyId, movementId, forUpdate = false) {
  const lock = forUpdate ? 'FOR UPDATE' : '';
  const { rows } = await db.query(
    `SELECT m.*, mt.direction, mt.code AS movement_type_code
     FROM inventory_movements m
     JOIN inventory_movement_types mt ON mt.id = m.movement_type_id
     WHERE m.id = $1 AND m.company_id = $2
     ${lock}`,
    [movementId, companyId]
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Movimiento no encontrado'), { status: 404 });
  }
  if (rows[0].status !== 'borrador' && forUpdate) {
    throw Object.assign(new Error('Solo se pueden editar movimientos en borrador'), { status: 400 });
  }
  return rows[0];
}

export async function loadMovementDetails(db, movementId) {
  const { rows } = await db.query(
    `SELECT d.*,
            a.code AS article_code, a.name AS article_name,
            l.internal_lot_number, l.supplier_lot_number, l.expiry_date
     FROM inventory_movement_details d
     JOIN inventory_articles a ON a.id = d.article_id
     LEFT JOIN inventory_lots l ON l.id = d.lot_id
     WHERE d.movement_id = $1
     ORDER BY d.line_number`,
    [movementId]
  );
  return rows.map(formatMovementDetail);
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function applyEntryLine(client, companyId, movement, article, line) {
  const internalLot = await allocateInternalLotNumber(client, companyId);
  const supplierLot = resolveSupplierLot(article, line.supplierLotNumber, internalLot);
  const expiryDate = resolveExpiryDate(article, line.expiryDate, movement.movement_date);
  const unitCost = round4(line.unitCost ?? 0);
  if (unitCost <= 0) {
    throw Object.assign(new Error(`Indique el costo de compra para ${article.code}`), { status: 400 });
  }
  const qty = round4(line.quantity);

  const lotResult = await client.query(
    `INSERT INTO inventory_lots (
       company_id, article_id, internal_lot_number, supplier_lot_number, expiry_date, manufacturing_date
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [companyId, article.id, internalLot, supplierLot, expiryDate, line.manufacturingDate || null]
  );
  const lot = lotResult.rows[0];

  const balResult = await client.query(
    `INSERT INTO inventory_lot_balances (
       company_id, warehouse_id, article_id, lot_id, quantity_on_hand, purchase_unit_cost
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (warehouse_id, article_id, lot_id) DO UPDATE SET
       quantity_on_hand = inventory_lot_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
       purchase_unit_cost = EXCLUDED.purchase_unit_cost,
       updated_at = NOW()
     RETURNING *`,
    [companyId, line.warehouseId || movement.warehouse_id, article.id, lot.id, qty, unitCost]
  );

  const oldQty = Number(balResult.rows[0].quantity_on_hand) - qty;
  const oldAvg = Number(article.average_cost) || 0;
  const newAvg = oldQty + qty > 0 ? round4((oldQty * oldAvg + qty * unitCost) / (oldQty + qty)) : unitCost;
  await client.query(
    `UPDATE inventory_articles SET average_cost = $1, updated_at = NOW() WHERE id = $2`,
    [newAvg, article.id]
  );

  return {
    lotId: lot.id,
    warehouseId: line.warehouseId || movement.warehouse_id,
    quantity: qty,
    unitCost,
    totalCost: round2(qty * unitCost),
  };
}

async function applyExitLine(client, companyId, movement, article, line) {
  if (!line.lotId) {
    throw Object.assign(new Error(`Seleccione lote para salida de ${article.code}`), { status: 400 });
  }
  const qty = round4(line.quantity);
  const whId = line.warehouseId || movement.warehouse_id;

  const { rows } = await client.query(
    `SELECT * FROM inventory_lot_balances
     WHERE company_id = $1 AND warehouse_id = $2 AND article_id = $3 AND lot_id = $4
     FOR UPDATE`,
    [companyId, whId, article.id, line.lotId]
  );
  if (!rows[0]) {
    throw Object.assign(new Error(`No hay existencia del lote seleccionado para ${article.code}`), { status: 400 });
  }
  const available = Number(rows[0].quantity_on_hand);
  if (available < qty) {
    throw Object.assign(new Error(`Stock insuficiente para ${article.code}. Disponible: ${available}`), { status: 400 });
  }
  const unitCost = Number(rows[0].purchase_unit_cost);

  await client.query(
    `UPDATE inventory_lot_balances
     SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW()
     WHERE id = $2`,
    [qty, rows[0].id]
  );

  return {
    lotId: line.lotId,
    warehouseId: whId,
    quantity: qty,
    unitCost,
    totalCost: round2(qty * unitCost),
  };
}

async function applyTransferReceiptLine(client, companyId, targetWarehouseId, articleId, lotId, quantity, unitCost) {
  const qty = round4(quantity);
  await client.query(
    `INSERT INTO inventory_lot_balances (
       company_id, warehouse_id, article_id, lot_id, quantity_on_hand, purchase_unit_cost
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (warehouse_id, article_id, lot_id) DO UPDATE SET
       quantity_on_hand = inventory_lot_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
       updated_at = NOW()`,
    [companyId, targetWarehouseId, articleId, lotId, qty, round4(unitCost)],
  );
}

async function createTransferEntryMovement(
  client,
  companyId,
  exitMovement,
  exitMovementId,
  userId,
  transferLines,
  totalQty,
  totalValue,
  transferInCode,
) {
  const targetWarehouseId = exitMovement.target_warehouse_id;
  if (!targetWarehouseId) {
    throw Object.assign(new Error('Indique la bodega destino para el traslado'), { status: 400 });
  }

  const { rows: typeRows } = await client.query(
    `SELECT id FROM inventory_movement_types WHERE company_id = $1 AND code = $2 AND is_active = true`,
    [companyId, transferInCode],
  );
  if (!typeRows[0]) {
    throw Object.assign(
      new Error(`Tipo de movimiento ${transferInCode} (Recepción de traslado) no configurado`),
      { status: 400 },
    );
  }

  const entryTypeId = typeRows[0].id;
  const docNumber = await allocateDocumentNumber(client, companyId, targetWarehouseId, entryTypeId);
  const reference = exitMovement.reference_number?.trim()
    ? `${exitMovement.reference_number.trim()} (traslado ${exitMovement.document_number})`
    : `Traslado ${exitMovement.document_number}`;

  const { rows: entryRows } = await client.query(
    `INSERT INTO inventory_movements (
       company_id, warehouse_id, target_warehouse_id, movement_type_id, related_movement_id,
       document_number, movement_date, reference_number, notes,
       total_quantity, total_value, status, created_by, confirmed_by, confirmed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmado',$12,$12,NOW())
     RETURNING *`,
    [
      companyId,
      targetWarehouseId,
      exitMovement.warehouse_id,
      entryTypeId,
      exitMovementId,
      docNumber,
      exitMovement.movement_date,
      reference,
      exitMovement.notes?.trim()
        ? `Recepción automática. ${exitMovement.notes.trim()}`
        : `Recepción automática por traslado ${exitMovement.document_number}`,
      round4(totalQty),
      round2(totalValue),
      userId,
    ],
  );
  const entryMovement = entryRows[0];

  let lineNum = 0;
  for (const t of transferLines) {
    lineNum += 1;
    await client.query(
      `INSERT INTO inventory_movement_details (
         movement_id, line_number, article_id, lot_id, warehouse_id,
         quantity, unit_cost, total_cost, supplier_lot_number, expiry_date, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        entryMovement.id,
        lineNum,
        t.articleId,
        t.lotId,
        targetWarehouseId,
        t.quantity,
        t.unitCost,
        t.totalCost,
        t.supplierLotNumber || null,
        t.expiryDate || null,
        t.notes || null,
      ],
    );
  }

  await client.query(
    `UPDATE inventory_movements SET related_movement_id = $1, updated_at = NOW() WHERE id = $2`,
    [entryMovement.id, exitMovementId],
  );

  return entryMovement;
}

export async function confirmInventoryMovement(client, companyId, movementId, userId) {
  const movement = await loadMovementForUpdate(client, companyId, movementId, true);
  if (movement.status !== 'borrador') {
    throw Object.assign(new Error('El movimiento ya fue procesado'), { status: 400 });
  }

  const movSettings = await getInventoryMovementSettings(client, companyId);
  const isTransferOut = isTransferOutCode(movement.movement_type_code, movSettings);
  if (isTransferOut && movement.related_movement_id) {
    throw Object.assign(new Error('Este traslado ya generó la recepción en bodega destino'), { status: 400 });
  }
  if (isTransferOut && !movement.target_warehouse_id) {
    throw Object.assign(new Error('Indique la bodega destino para traslados'), { status: 400 });
  }

  const { rows: detailRows } = await client.query(
    `SELECT d.*, a.code, a.name, a.without_supplier_lot, a.requires_expiry_date,
            a.default_expiry_days, a.average_cost
     FROM inventory_movement_details d
     JOIN inventory_articles a ON a.id = d.article_id
     WHERE d.movement_id = $1
     ORDER BY d.line_number
     FOR UPDATE`,
    [movementId]
  );
  if (!detailRows.length) {
    throw Object.assign(new Error('El movimiento no tiene líneas de detalle'), { status: 400 });
  }

  const isEntry = movement.direction === 'entrada';
  let totalQty = 0;
  let totalValue = 0;
  const transferLines = [];

  for (const line of detailRows) {
    const article = {
      id: line.article_id,
      code: line.code,
      without_supplier_lot: line.without_supplier_lot,
      requires_expiry_date: line.requires_expiry_date,
      default_expiry_days: line.default_expiry_days,
      average_cost: line.average_cost,
    };
    const payload = {
      quantity: line.quantity,
      unitCost: line.unit_cost,
      lotId: line.lot_id,
      supplierLotNumber: line.supplier_lot_number,
      expiryDate: line.expiry_date,
      warehouseId: line.warehouse_id,
    };

    let applied;
    if (isEntry) {
      applied = await applyEntryLine(client, companyId, movement, article, payload);
      await client.query(
        `UPDATE inventory_movement_details
         SET lot_id = $1, unit_cost = $2, total_cost = $3
         WHERE id = $4`,
        [applied.lotId, applied.unitCost, applied.totalCost, line.id]
      );
    } else {
      applied = await applyExitLine(client, companyId, movement, article, payload);
      await client.query(
        `UPDATE inventory_movement_details
         SET unit_cost = $1, total_cost = $2
         WHERE id = $3`,
        [applied.unitCost, applied.totalCost, line.id]
      );

      if (isTransferOut) {
        await applyTransferReceiptLine(
          client,
          companyId,
          movement.target_warehouse_id,
          article.id,
          applied.lotId,
          applied.quantity,
          applied.unitCost,
        );
        transferLines.push({
          articleId: article.id,
          lotId: applied.lotId,
          quantity: applied.quantity,
          unitCost: applied.unitCost,
          totalCost: applied.totalCost,
          supplierLotNumber: line.supplier_lot_number,
          expiryDate: line.expiry_date,
          notes: line.notes,
        });
      }
    }
    totalQty += applied.quantity;
    totalValue += applied.totalCost;
  }

  let relatedEntryMovement = null;
  if (isTransferOut) {
    relatedEntryMovement = await createTransferEntryMovement(
      client,
      companyId,
      movement,
      movementId,
      userId,
      transferLines,
      totalQty,
      totalValue,
      movSettings.transferIn,
    );
  }

  await client.query(
    `UPDATE inventory_movements
     SET status = 'confirmado', confirmed_by = $1, confirmed_at = NOW(),
         total_quantity = $2, total_value = $3, updated_at = NOW()
     WHERE id = $4`,
    [userId, round4(totalQty), round2(totalValue), movementId]
  );

  return {
    totalQuantity: totalQty,
    totalValue: round2(totalValue),
    relatedMovementId: relatedEntryMovement?.id || null,
    relatedMovementDocument: relatedEntryMovement?.document_number || null,
  };
}

export async function listInventorySettings(db, companyId) {
  const keys = [
    'inventory.internal_lot_prefix',
    'inventory.valuation_method',
    'inventory.articles.code_prefix',
    MOVEMENT_SETTING_KEYS.transferOut,
    MOVEMENT_SETTING_KEYS.transferIn,
    MOVEMENT_SETTING_KEYS.saleOut,
  ];
  const { rows } = await db.query(
    `SELECT var_key, var_value, label, description, sort_order, is_editable
     FROM company_system_variables
     WHERE company_id = $1 AND var_key = ANY($2)
     ORDER BY sort_order`,
    [companyId, keys]
  );
  return rows.map((r) => ({
    key: r.var_key,
    value: r.var_value,
    label: r.label,
    description: r.description,
    sortOrder: r.sort_order,
    isEditable: r.is_editable,
  }));
}
