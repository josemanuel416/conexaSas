import PDFDocument from 'pdfkit';
import { resolveCompanyLogoAbsolute } from './company-logo.js';
import { formatDateEs as formatDate, formatDateTimeEs, todayIsoDate } from './app-timezone.js';

const PAGE_MARGIN = 40;
const FOOTER_Y = 740;
const BRAND = '#00796B';
const TABLE_HEAD = '#455A64';

function money(value) {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function qty(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');
}

function statusLabel(status) {
  return { borrador: 'Borrador', confirmado: 'Confirmado', anulado: 'Anulado' }[status] || status || '—';
}

function companyLogoPath(company) {
  return resolveCompanyLogoAbsolute(company.logoPath || company.logo_path);
}

function scaleCols(cols, pageWidth) {
  const sum = cols.reduce((a, b) => a + b, 0);
  const scaled = cols.map((c) => Math.floor((c / sum) * pageWidth));
  const diff = pageWidth - scaled.reduce((a, b) => a + b, 0);
  if (diff !== 0) scaled[scaled.length - 1] += diff;
  return scaled;
}

function ensureSpace(doc, y, needed = 40) {
  if (y + needed > FOOTER_Y) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function drawCompanyHeader(doc, company, title, pageWidth) {
  const logoPath = companyLogoPath(company);
  const logoW = 78;
  const logoH = 58;
  let y = PAGE_MARGIN;
  let headerBottom = y;

  if (logoPath) {
    try {
      doc.image(logoPath, PAGE_MARGIN, y, { fit: [logoW, logoH], align: 'center', valign: 'center' });
      headerBottom = Math.max(headerBottom, y + logoH);
    } catch {
      // logo ilegible: continuar solo con texto
    }
  }

  const textX = logoPath ? PAGE_MARGIN + logoW + 14 : PAGE_MARGIN;
  const textW = logoPath ? pageWidth - logoW - 14 : pageWidth;

  doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND)
    .text(company.name || '—', textX, y + 6, { width: textW });
  let textY = y + 24;
  if (company.nit) {
    doc.font('Helvetica').fontSize(9).fillColor('#616161')
      .text(`NIT ${company.nit}`, textX, textY, { width: textW });
    textY += 12;
  }
  if (company.address) {
    doc.text(company.address, textX, textY, { width: textW });
    textY += 12;
  }
  if (company.phone) {
    doc.text(`Tel. ${company.phone}`, textX, textY, { width: textW });
    textY += 12;
  }
  headerBottom = Math.max(headerBottom, textY);

  y = headerBottom + 10;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + pageWidth, y).strokeColor(BRAND).lineWidth(1.5).stroke();
  y += 10;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#212121')
    .text(title, PAGE_MARGIN, y, { width: pageWidth, align: 'center' });
  return y + 24;
}

function drawFilters(doc, y, filters, pageWidth) {
  if (!filters?.length) return y;
  doc.font('Helvetica').fontSize(9).fillColor('#424242');
  for (const line of filters) {
    doc.text(line, PAGE_MARGIN, y, { width: pageWidth });
    y += 12;
  }
  return y + 6;
}

function drawInfoCard(doc, y, pageWidth, fields) {
  const cardPadding = 10;
  const colCount = 3;
  const colW = (pageWidth - cardPadding * 2) / colCount;
  const rowsNeeded = Math.ceil(fields.length / colCount);
  const rowH = 30;
  const cardH = cardPadding * 2 + rowsNeeded * rowH;

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, pageWidth, cardH, 4).fill('#FAFAFA');
  doc.roundedRect(PAGE_MARGIN, y, pageWidth, cardH, 4).lineWidth(0.8).strokeColor('#BDBDBD').stroke();
  doc.restore();

  fields.forEach((field, idx) => {
    const col = idx % colCount;
    const row = Math.floor(idx / colCount);
    const x = PAGE_MARGIN + cardPadding + col * colW;
    const fy = y + cardPadding + row * rowH;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#757575')
      .text(field.label, x, fy, { width: colW - 8 });
    doc.font('Helvetica').fontSize(9).fillColor('#212121')
      .text(field.value || '—', x, fy + 11, { width: colW - 8 });
  });

  return y + cardH + 14;
}

function drawTableHeader(doc, y, headers, cols, pageWidth, color = BRAND) {
  const scaled = scaleCols(cols, pageWidth);
  doc.save();
  doc.rect(PAGE_MARGIN, y, pageWidth, 18).fill(color);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
  let x = PAGE_MARGIN + 4;
  headers.forEach((h, i) => {
    doc.text(h, x, y + 5, { width: scaled[i] - 8 });
    x += scaled[i];
  });
  doc.restore();
  return { y: y + 20, cols: scaled };
}

function drawTableRow(doc, y, cells, scaledCols, pageWidth, { stripe = false } = {}) {
  const rowH = 16;
  if (stripe) {
    doc.save();
    doc.rect(PAGE_MARGIN, y - 1, pageWidth, rowH + 2).fill('#F5F5F5');
    doc.restore();
  }
  doc.fillColor('#212121').font('Helvetica').fontSize(8);
  let x = PAGE_MARGIN + 4;
  cells.forEach((cell, i) => {
    doc.text(String(cell ?? '—'), x, y + 2, { width: scaledCols[i] - 8 });
    x += scaledCols[i];
  });
  return y + rowH;
}

function drawSignatureBlock(doc, y, pageWidth) {
  y = ensureSpace(doc, y, 90);
  y += 16;
  const gap = 24;
  const sigW = (pageWidth - gap) / 2;
  const blocks = [
    { x: PAGE_MARGIN, label: 'Quien entrega' },
    { x: PAGE_MARGIN + sigW + gap, label: 'Quien recibe' },
  ];

  blocks.forEach(({ x, label }) => {
    doc.moveTo(x, y + 36).lineTo(x + sigW, y + 36).strokeColor('#424242').lineWidth(0.6).stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#424242')
      .text(label, x, y + 40, { width: sigW, align: 'center' });
    doc.font('Helvetica').fontSize(7).fillColor('#9E9E9E')
      .text('Nombre · Documento · Firma', x, y + 52, { width: sigW, align: 'center' });
  });

  return y + 70;
}

function drawFooter(doc, pageWidth, label) {
  const generated = formatDateTimeEs(new Date());
  doc.font('Helvetica').fontSize(7).fillColor('#9E9E9E')
    .text(`Generado ${generated} — ${label}`, PAGE_MARGIN, FOOTER_Y, {
      width: pageWidth,
      align: 'center',
    });
}

export function buildMovimientosReportPdfFileName() {
  const stamp = todayIsoDate();
  return `Movimientos-inventario-${stamp}.pdf`;
}

export function buildExistenciasReportPdfFileName() {
  const stamp = todayIsoDate();
  return `Existencias-inventario-${stamp}.pdf`;
}

export function buildMovimientoDetallePdfFileName(movement) {
  const num = movement.documentNumber || movement.document_number || 'movimiento';
  return `Movimiento-${num}.pdf`;
}

export function buildMovimientosReportPdf({ company, filters = [], movements = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN, layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    let y = drawCompanyHeader(doc, company, 'INFORME DE MOVIMIENTOS DE INVENTARIO', pageWidth);
    y = drawFilters(doc, y, filters, pageWidth);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND)
      .text(`Registros (${movements.length})`, PAGE_MARGIN, y);
    y += 14;

    const colDefs = [85, 62, 95, 120, 72, 95, 55, 70, 70];
    const headers = ['Documento', 'Fecha', 'Bodega', 'Tipo', 'Estado', 'Tercero', 'Cant.', 'Valor', 'Referencia'];
    const { y: tableY, cols } = drawTableHeader(doc, y, headers, colDefs, pageWidth);
    y = tableY;

    let totalQty = 0;
    let totalVal = 0;

    movements.forEach((m, idx) => {
      y = ensureSpace(doc, y, 18);
      totalQty += Number(m.totalQuantity) || 0;
      totalVal += Number(m.totalValue) || 0;
      y = drawTableRow(doc, y, [
        m.documentNumber || '—',
        formatDate(m.movementDate),
        m.warehouseName || '—',
        `${m.movementTypeCode || ''} ${m.movementTypeName || ''}`.trim(),
        statusLabel(m.status),
        m.thirdPartyName || '—',
        qty(m.totalQuantity),
        `$${money(m.totalValue)}`,
        m.referenceNumber || '—',
      ], cols, pageWidth, { stripe: idx % 2 === 1 });
    });

    y = ensureSpace(doc, y, 24);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#424242')
      .text(`Totales: ${qty(totalQty)} unidades — $${money(totalVal)}`, PAGE_MARGIN, y);

    drawFooter(doc, pageWidth, 'Informe interno de movimientos de inventario');
    doc.end();
  });
}

export function buildMovimientoDetallePdf({ company, movement }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    let y = drawCompanyHeader(doc, company, 'MOVIMIENTO DE INVENTARIO', pageWidth);

    const fields = [
      { label: 'DOCUMENTO', value: movement.documentNumber || '—' },
      { label: 'FECHA', value: formatDate(movement.movementDate) },
      { label: 'ESTADO', value: statusLabel(movement.status) },
      { label: 'TIPO', value: `${movement.movementTypeCode || ''} — ${movement.movementTypeName || '—'}`.trim() },
      { label: 'BODEGA', value: movement.warehouseName || '—' },
      ...(movement.targetWarehouseName
        ? [{ label: 'BODEGA DESTINO', value: movement.targetWarehouseName }]
        : []),
      ...(movement.thirdPartyName
        ? [{
            label: 'TERCERO',
            value: `${movement.thirdPartyName}${movement.thirdPartyDocument ? ` (${movement.thirdPartyDocument})` : ''}`,
          }]
        : []),
      ...(movement.referenceNumber ? [{ label: 'REFERENCIA', value: movement.referenceNumber }] : []),
      ...(movement.notes ? [{ label: 'NOTAS', value: movement.notes }] : []),
    ];
    y = drawInfoCard(doc, y, pageWidth, fields);

    const details = movement.details || [];
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND)
      .text(`Detalle (${details.length} ${details.length === 1 ? 'línea' : 'líneas'})`, PAGE_MARGIN, y);
    y += 14;

    const colDefs = [68, 145, 72, 72, 48, 62, 65];
    const headers = ['Código', 'Artículo', 'Lote int.', 'Lote prov.', 'Cant.', 'Costo', 'Total'];
    const { y: tableY, cols } = drawTableHeader(doc, y, headers, colDefs, pageWidth, TABLE_HEAD);
    y = tableY;

    details.forEach((d, idx) => {
      y = ensureSpace(doc, y, 18);
      y = drawTableRow(doc, y, [
        d.articleCode || '—',
        d.articleName || '—',
        d.internalLotNumber || '—',
        d.supplierLotNumber || '—',
        qty(d.quantity),
        `$${money(d.unitCost)}`,
        `$${money(d.totalCost)}`,
      ], cols, pageWidth, { stripe: idx % 2 === 1 });
    });

    y = ensureSpace(doc, y, 28);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#424242')
      .text(
        `Total movimiento: ${qty(movement.totalQuantity)} unidades — $${money(movement.totalValue)}`,
        PAGE_MARGIN,
        y,
      );
    y += 24;

    drawSignatureBlock(doc, y, pageWidth);
    drawFooter(doc, pageWidth, 'Documento interno de movimiento de inventario');
    doc.end();
  });
}

export function buildExistenciasReportPdf({ company, filters = [], balances = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN, layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    let y = drawCompanyHeader(doc, company, 'INFORME DE EXISTENCIAS', pageWidth);
    y = drawFilters(doc, y, filters, pageWidth);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND)
      .text(`Registros (${balances.length})`, PAGE_MARGIN, y);
    y += 14;

    const colDefs = [85, 70, 130, 75, 75, 62, 55, 70, 70];
    const headers = ['Bodega', 'Código', 'Artículo', 'Lote int.', 'Lote prov.', 'Vence', 'Cant.', 'Costo', 'Valor'];
    const { y: tableY, cols } = drawTableHeader(doc, y, headers, colDefs, pageWidth);
    y = tableY;

    let totalQty = 0;
    let totalVal = 0;

    balances.forEach((b, idx) => {
      y = ensureSpace(doc, y, 18);
      const lineVal = Number(b.totalValue) || (Number(b.quantityOnHand) * Number(b.purchaseUnitCost));
      totalQty += Number(b.quantityOnHand) || 0;
      totalVal += lineVal;
      y = drawTableRow(doc, y, [
        b.warehouseName || '—',
        b.articleCode || '—',
        b.articleName || '—',
        b.internalLotNumber || '—',
        b.supplierLotNumber || '—',
        formatDate(b.expiryDate),
        qty(b.quantityOnHand),
        `$${money(b.purchaseUnitCost)}`,
        `$${money(lineVal)}`,
      ], cols, pageWidth, { stripe: idx % 2 === 1 });
    });

    y = ensureSpace(doc, y, 24);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#424242')
      .text(`Totales: ${qty(totalQty)} unidades — $${money(totalVal)}`, PAGE_MARGIN, y);

    drawFooter(doc, pageWidth, 'Informe interno de existencias de inventario');
    doc.end();
  });
}
