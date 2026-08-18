import { buildFullNumber } from './invoice-dian-number.js';

function calcLine(quantity, unitPrice, discountAmount, taxRate) {
  const qty = Number(quantity) || 1;
  const price = Number(unitPrice) || 0;
  const discount = Number(discountAmount) || 0;
  const rate = Number(taxRate) || 0;
  const base = Math.max(0, qty * price - discount);
  const taxAmount = Math.round(base * (rate / 100) * 100) / 100;
  const lineTotal = Math.round((base + taxAmount) * 100) / 100;
  return { base, taxAmount, lineTotal };
}

async function nextInternalNumber(client, companyId, kind) {
  const prefixMap = { cotizacion: 'COT', prefactura: 'PRE' };
  const prefix = prefixMap[kind];
  if (!prefix) {
    throw Object.assign(new Error('Tipo de documento sin numeración interna'), { status: 400 });
  }
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(
       NULLIF(regexp_replace(internal_number, '^${prefix}-', ''), internal_number)::INTEGER
     ), 0) + 1 AS next
     FROM invoices
     WHERE company_id = $1 AND document_kind = $2`,
    [companyId, kind],
  );
  return `${prefix}-${String(rows[0].next).padStart(6, '0')}`;
}

function buildLinesFromMovementDetails(details, taxRate) {
  let subtotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;
  let total = 0;
  const computedLines = [];

  for (let i = 0; i < details.length; i += 1) {
    const line = details[i];
    const unitPrice = Number(line.unit_cost);
    if (!line.article_code || !line.article_name) {
      throw Object.assign(new Error(`Línea ${i + 1}: artículo incompleto`), { status: 400 });
    }
    if (unitPrice <= 0) {
      throw Object.assign(
        new Error(`Línea ${i + 1} (${line.article_code}): indique precio de venta mayor a cero`),
        { status: 400 },
      );
    }

    const calc = calcLine(line.quantity, unitPrice, 0, taxRate);
    subtotal += calc.base;
    taxAmount += calc.taxAmount;
    total += calc.lineTotal;

    computedLines.push({
      lineNumber: i + 1,
      serviceId: null,
      itemCode: line.article_code,
      description: line.article_name,
      quantity: Number(line.quantity) || 1,
      unitPrice,
      discountAmount: 0,
      taxRate,
      taxAmount: calc.taxAmount,
      lineTotal: calc.lineTotal,
    });
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    computedLines,
  };
}

export async function createInvoiceFromMovement(client, {
  companyId,
  userId,
  movement,
  details,
  dianResolutionId,
  emit = false,
  taxRate = 19,
  notes,
}) {
  if (movement.invoice_id) {
    throw Object.assign(new Error('Este movimiento ya tiene un documento de venta vinculado'), { status: 400 });
  }
  if (!movement.client_id) {
    throw Object.assign(new Error('El movimiento debe tener un cliente asignado'), { status: 400 });
  }
  if (!details.length) {
    throw Object.assign(new Error('El movimiento no tiene líneas de detalle'), { status: 400 });
  }

  const { rows: clientRows } = await client.query(
    `SELECT id FROM clients WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [movement.client_id, companyId],
  );
  if (!clientRows[0]) {
    throw Object.assign(new Error('Cliente del movimiento no válido'), { status: 400 });
  }

  const { subtotal, discountAmount, taxAmount, total, computedLines } =
    buildLinesFromMovementDetails(details, taxRate);

  const movementNotes = movement.notes?.trim()
    ? `Desde movimiento ${movement.document_number}. ${movement.notes.trim()}`
    : `Desde movimiento ${movement.document_number}`;

  let invoiceId;

  if (!dianResolutionId) {
    const internalNumber = await nextInternalNumber(client, companyId, 'prefactura');
    const status = emit ? 'emitida' : 'borrador';
    const { rows: invRows } = await client.query(
      `INSERT INTO invoices (
         company_id, document_kind, client_id, internal_number,
         subtotal, discount_amount, tax_amount, total, status, notes, created_by
       ) VALUES ($1,'prefactura',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        companyId,
        movement.client_id,
        internalNumber,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        status,
        notes?.trim() || movementNotes,
        userId,
      ],
    );
    invoiceId = invRows[0].id;
  } else {
    const { rows: resRows } = await client.query(
      `SELECT * FROM dian_resolutions
       WHERE id = $1 AND company_id = $2 AND is_active = true AND document_type = '01'
       FOR UPDATE`,
      [dianResolutionId, companyId],
    );
    const resolution = resRows[0];
    if (!resolution) {
      throw Object.assign(new Error('Resolución DIAN de factura no válida'), { status: 400 });
    }

    const next = Number(resolution.current_consecutive) + 1;
    if (next > Number(resolution.range_to)) {
      throw Object.assign(new Error('La resolución DIAN agotó el rango de numeración'), { status: 400 });
    }

    const fullNumber = buildFullNumber(resolution.prefix, next);
    const status = emit === true ? 'emitida' : 'borrador';

    const { rows: invRows } = await client.query(
      `INSERT INTO invoices (
         company_id, document_kind, dian_resolution_id, client_id,
         prefix, consecutive_number, full_number,
         subtotal, discount_amount, tax_amount, total, status, notes, created_by
       ) VALUES ($1,'factura',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        companyId,
        dianResolutionId,
        movement.client_id,
        resolution.prefix,
        next,
        fullNumber,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        status,
        notes?.trim() || movementNotes,
        userId,
      ],
    );
    invoiceId = invRows[0].id;

    await client.query(
      `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
      [next, resolution.id],
    );

    if (status === 'emitida') {
      await client.query(
        `UPDATE invoices SET
           issue_date = (NOW() AT TIME ZONE 'America/Bogota')::date,
           issue_time = (NOW() AT TIME ZONE 'America/Bogota')::time
         WHERE id = $1`,
        [invoiceId],
      );
    }
  }

  for (const line of computedLines) {
    await client.query(
      `INSERT INTO invoice_details (
         invoice_id, line_number, service_id, item_code, description, quantity,
         unit_price, discount_amount, tax_rate, tax_amount, line_total
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        invoiceId,
        line.lineNumber,
        line.serviceId,
        line.itemCode,
        line.description,
        line.quantity,
        line.unitPrice,
        line.discountAmount,
        line.taxRate,
        line.taxAmount,
        line.lineTotal,
      ],
    );
  }

  await client.query(
    `UPDATE inventory_movements SET invoice_id = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`,
    [invoiceId, movement.id, companyId],
  );

  const { rows: invoiceRows } = await client.query(
    `SELECT id, document_kind, internal_number, full_number, status, total
     FROM invoices WHERE id = $1 AND company_id = $2`,
    [invoiceId, companyId],
  );

  return invoiceRows[0];
}
