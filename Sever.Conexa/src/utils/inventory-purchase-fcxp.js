function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

export function assertPurchaseInvoiceFields({
  clientId,
  supplierInvoiceNumber,
  supplierInvoiceDate,
  supplierInvoiceDueDate,
}) {
  const missing = [];
  if (!clientId) missing.push('proveedor');
  if (!String(supplierInvoiceNumber || '').trim()) missing.push('N. factura');
  if (!isoDate(supplierInvoiceDate)) missing.push('fecha de generación');
  if (!isoDate(supplierInvoiceDueDate)) missing.push('fecha de vencimiento');
  if (missing.length) {
    throw Object.assign(new Error(`Complete: ${missing.join(', ')}`), { status: 400 });
  }
  if (isoDate(supplierInvoiceDueDate) < isoDate(supplierInvoiceDate)) {
    throw Object.assign(
      new Error('La fecha de vencimiento no puede ser anterior a la fecha de generación'),
      { status: 400 },
    );
  }
}

export async function createFcxpFromPurchaseEntry(client, {
  companyId,
  userId,
  movement,
  details,
}) {
  if (movement.fcxp_id) {
    return { id: movement.fcxp_id, cnsFcxp: null, alreadyLinked: true };
  }

  assertPurchaseInvoiceFields({
    clientId: movement.client_id,
    supplierInvoiceNumber: movement.supplier_invoice_number,
    supplierInvoiceDate: movement.supplier_invoice_date,
    supplierInvoiceDueDate: movement.supplier_invoice_due_date,
  });

  const nroFactura = String(movement.supplier_invoice_number).trim();
  const fechaFactura = isoDate(movement.supplier_invoice_date);
  const fechaVence = isoDate(movement.supplier_invoice_due_date);

  const { rows: dupRows } = await client.query(
    `SELECT id FROM fcxp
     WHERE company_id = $1 AND id_tercero = $2 AND nro_factura = $3 AND status <> 'anulada'
     LIMIT 1`,
    [companyId, movement.client_id, nroFactura],
  );
  if (dupRows[0]) {
    throw Object.assign(
      new Error('Ya existe una cuenta por pagar con esa N. factura para el proveedor'),
      { status: 409 },
    );
  }

  const { rows: terceroRows } = await client.query(
    `SELECT maneja_doc_soporte FROM clients WHERE id = $1 AND company_id = $2`,
    [movement.client_id, companyId],
  );
  if (!terceroRows[0]) {
    throw Object.assign(new Error('Proveedor no encontrado'), { status: 400 });
  }

  const lines = details.map((line, index) => {
    const qty = Number(line.quantity) || 0;
    const unit = Number(line.unit_cost) || 0;
    const neto = round2(line.total_cost != null ? line.total_cost : qty * unit);
    const name = [line.code || line.article_code, line.name || line.article_name].filter(Boolean).join(' — ');
    return {
      item: index + 1,
      descripcion: name || 'Entrada de inventario',
      valor: unit,
      cantidad: qty,
      vlrNeto: neto,
    };
  });
  const vlrBruto = round2(lines.reduce((sum, line) => sum + line.vlrNeto, 0));

  const { rows: seqRows } = await client.query(
    `SELECT COALESCE(MAX(cns_fcxp), 0) + 1 AS next FROM fcxp WHERE company_id = $1`,
    [companyId],
  );
  const cnsFcxp = Number(seqRows[0].next);
  const fechaCxp = isoDate(movement.movement_date) || fechaFactura;
  const detalle = movement.notes?.trim()
    || `Entrada de inventario ${movement.document_number || ''}`.trim();

  let cnsResol = null;
  let cnsDocSoporte = null;
  if (terceroRows[0].maneja_doc_soporte) {
    const { rows: resolutionRows } = await client.query(
      `SELECT * FROM dian_resolutions
       WHERE company_id = $1 AND document_process = 'DS' AND document_type = '05' AND is_active = true
       FOR UPDATE`,
      [companyId],
    );
    const resolution = resolutionRows[0];
    if (!resolution) {
      throw Object.assign(
        new Error('El proveedor maneja documento soporte y no hay resolución DS activa (tipo 05)'),
        { status: 400 },
      );
    }
    const next = Number(resolution.current_consecutive) + 1;
    if (next > Number(resolution.range_to)) {
      throw Object.assign(new Error('Rango de numeración DS agotado'), { status: 400 });
    }
    await client.query(
      `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
      [next, resolution.id],
    );
    cnsResol = resolution.id;
    cnsDocSoporte = `${resolution.prefix}${String(next).padStart(8, '0')}`;
  }

  const { rows } = await client.query(
    `INSERT INTO fcxp (
       company_id, cns_fcxp, cns_interno, fecha_cxp, nro_factura, fecha_factura, fecha_vence,
       id_tercero, detalle, maneja_doc_soporte, cns_doc_soporte, cns_resol,
       vlr_bruto, vlr_iva, vlr_impuestos, valor_neto, saldo, status, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,0,$13,$13,'confirmada',$14)
     RETURNING id, cns_fcxp`,
    [
      companyId,
      cnsFcxp,
      movement.document_number ? String(movement.document_number).slice(0, 30) : null,
      fechaCxp,
      nroFactura,
      fechaFactura,
      fechaVence,
      movement.client_id,
      detalle,
      Boolean(terceroRows[0].maneja_doc_soporte),
      cnsDocSoporte,
      cnsResol,
      vlrBruto,
      userId,
    ],
  );

  for (const line of lines) {
    await client.query(
      `INSERT INTO fcxpd (
         company_id, fcxp_id, item, descripcion, valor, cantidad, vlr_iva, vlr_neto
       ) VALUES ($1,$2,$3,$4,$5,$6,0,$7)`,
      [companyId, rows[0].id, line.item, line.descripcion, line.valor, line.cantidad, line.vlrNeto],
    );
  }

  await client.query(
    `UPDATE inventory_movements SET fcxp_id = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`,
    [rows[0].id, movement.id, companyId],
  );

  return { id: rows[0].id, cnsFcxp: Number(rows[0].cns_fcxp), alreadyLinked: false };
}
