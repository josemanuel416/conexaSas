import ExcelJS from 'exceljs';

function moneyNum(value) {
  return Number(value) || 0;
}

function formatDate(value) {
  if (!value) return '';
  const raw = String(value);
  const d = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toLocaleDateString('es-CO');
}

function statusLabel(status) {
  return { borrador: 'Borrador', confirmado: 'Confirmado', anulado: 'Anulado' }[status] || status || '';
}

async function createWorkbook(title, company, filters = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ErpConexa';
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 31));

  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = company.name || 'Compañía';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF00796B' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  if (company.nit) {
    ws.mergeCells('A2:I2');
    ws.getCell('A2').value = `NIT ${company.nit}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getCell('A2').font = { size: 10, color: { argb: 'FF616161' } };
  }

  const titleRow = company.nit ? 3 : 2;
  ws.mergeCells(`A${titleRow}:I${titleRow}`);
  ws.getCell(`A${titleRow}`).value = title;
  ws.getCell(`A${titleRow}`).font = { bold: true, size: 12 };
  ws.getCell(`A${titleRow}`).alignment = { horizontal: 'center' };

  let rowIdx = titleRow + 1;
  for (const f of filters) {
    ws.mergeCells(`A${rowIdx}:I${rowIdx}`);
    ws.getCell(`A${rowIdx}`).value = f;
    ws.getCell(`A${rowIdx}`).font = { size: 10, color: { argb: 'FF424242' } };
    rowIdx += 1;
  }

  return { wb, ws, startRow: rowIdx + 1 };
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00796B' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  row.alignment = { vertical: 'middle' };
}

function styleDataRows(ws, fromRow, toRow, moneyCols = []) {
  for (let r = fromRow; r <= toRow; r += 1) {
    const row = ws.getRow(r);
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      if (moneyCols.includes(colNumber)) {
        cell.numFmt = '#,##0';
      }
    });
  }
}

export function buildMovimientosReportExcelFileName() {
  return `Movimientos-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function buildExistenciasReportExcelFileName() {
  return `Existencias-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function buildMovimientoDetalleExcelFileName(movement) {
  const num = movement.documentNumber || movement.document_number || 'movimiento';
  return `Movimiento-${num}.xlsx`;
}

export async function buildMovimientosReportExcel({ company, filters = [], movements = [] }) {
  const { wb, ws, startRow } = await createWorkbook(
    'INFORME DE MOVIMIENTOS DE INVENTARIO',
    company,
    filters,
  );

  const headers = [
    'Documento', 'Fecha', 'Bodega', 'Tipo código', 'Tipo', 'Estado',
    'Tercero', 'Doc. tercero', 'Cantidad', 'Valor', 'Referencia', 'Notas',
  ];
  const headerRow = ws.getRow(startRow);
  headerRow.values = headers;
  styleHeaderRow(headerRow);

  let totalQty = 0;
  let totalVal = 0;
  let rowIdx = startRow + 1;

  for (const m of movements) {
    totalQty += moneyNum(m.totalQuantity);
    totalVal += moneyNum(m.totalValue);
    ws.getRow(rowIdx).values = [
      m.documentNumber || '',
      formatDate(m.movementDate),
      m.warehouseName || '',
      m.movementTypeCode || '',
      m.movementTypeName || '',
      statusLabel(m.status),
      m.thirdPartyName || '',
      m.thirdPartyDocument || '',
      moneyNum(m.totalQuantity),
      moneyNum(m.totalValue),
      m.referenceNumber || '',
      m.notes || '',
    ];
    rowIdx += 1;
  }

  styleDataRows(ws, startRow + 1, rowIdx - 1, [9, 10]);

  ws.getRow(rowIdx + 1).values = ['', '', '', '', '', '', 'TOTALES', '', totalQty, totalVal];
  ws.getRow(rowIdx + 1).font = { bold: true };
  styleDataRows(ws, rowIdx + 1, rowIdx + 1, [9, 10]);

  ws.columns = [
    { width: 16 }, { width: 12 }, { width: 18 }, { width: 10 }, { width: 24 },
    { width: 12 }, { width: 24 }, { width: 14 }, { width: 12 }, { width: 14 },
    { width: 14 }, { width: 24 },
  ];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildMovimientoDetalleExcel({ company, movement }) {
  const { wb, ws, startRow } = await createWorkbook(
    `MOVIMIENTO ${movement.documentNumber || ''}`.trim(),
    company,
    [
      `Fecha: ${formatDate(movement.movementDate)}`,
      `Tipo: ${movement.movementTypeCode || ''} — ${movement.movementTypeName || ''}`,
      `Bodega: ${movement.warehouseName || ''}`,
      movement.targetWarehouseName ? `Destino: ${movement.targetWarehouseName}` : '',
      `Estado: ${statusLabel(movement.status)}`,
      movement.thirdPartyName ? `Tercero: ${movement.thirdPartyName}` : '',
    ].filter(Boolean),
  );

  const headers = ['Línea', 'Código', 'Artículo', 'Lote interno', 'Lote proveedor', 'Vence', 'Cantidad', 'Costo unit.', 'Total'];
  const headerRow = ws.getRow(startRow);
  headerRow.values = headers;
  styleHeaderRow(headerRow);

  const details = movement.details || [];
  let rowIdx = startRow + 1;
  details.forEach((d, i) => {
    ws.getRow(rowIdx).values = [
      i + 1,
      d.articleCode || '',
      d.articleName || '',
      d.internalLotNumber || '',
      d.supplierLotNumber || '',
      formatDate(d.expiryDate),
      moneyNum(d.quantity),
      moneyNum(d.unitCost),
      moneyNum(d.totalCost),
    ];
    rowIdx += 1;
  });

  styleDataRows(ws, startRow + 1, rowIdx - 1, [7, 8, 9]);
  ws.getRow(rowIdx + 1).values = ['', '', '', '', '', 'TOTAL', moneyNum(movement.totalQuantity), '', moneyNum(movement.totalValue)];
  ws.getRow(rowIdx + 1).font = { bold: true };
  styleDataRows(ws, rowIdx + 1, rowIdx + 1, [7, 9]);

  ws.columns = [
    { width: 8 }, { width: 14 }, { width: 28 }, { width: 14 }, { width: 14 },
    { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 },
  ];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildExistenciasReportExcel({ company, filters = [], balances = [] }) {
  const { wb, ws, startRow } = await createWorkbook(
    'INFORME DE EXISTENCIAS',
    company,
    filters,
  );

  const headers = [
    'Bodega', 'Código', 'Artículo', 'Lote interno', 'Lote proveedor',
    'Vencimiento', 'Cantidad', 'Costo compra', 'Valor total',
  ];
  const headerRow = ws.getRow(startRow);
  headerRow.values = headers;
  styleHeaderRow(headerRow);

  let totalQty = 0;
  let totalVal = 0;
  let rowIdx = startRow + 1;

  for (const b of balances) {
    const lineVal = moneyNum(b.totalValue) || moneyNum(b.quantityOnHand) * moneyNum(b.purchaseUnitCost);
    totalQty += moneyNum(b.quantityOnHand);
    totalVal += lineVal;
    ws.getRow(rowIdx).values = [
      b.warehouseName || '',
      b.articleCode || '',
      b.articleName || '',
      b.internalLotNumber || '',
      b.supplierLotNumber || '',
      formatDate(b.expiryDate),
      moneyNum(b.quantityOnHand),
      moneyNum(b.purchaseUnitCost),
      lineVal,
    ];
    rowIdx += 1;
  }

  styleDataRows(ws, startRow + 1, rowIdx - 1, [7, 8, 9]);
  ws.getRow(rowIdx + 1).values = ['', '', '', '', '', 'TOTALES', totalQty, '', totalVal];
  ws.getRow(rowIdx + 1).font = { bold: true };
  styleDataRows(ws, rowIdx + 1, rowIdx + 1, [7, 9]);

  ws.columns = [
    { width: 18 }, { width: 14 }, { width: 28 }, { width: 14 }, { width: 14 },
    { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 },
  ];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
