import PDFDocument from 'pdfkit';
import { resolveCompanyLogoAbsolute } from './company-logo.js';
import { CONEXASOFT_INVOICE_BRAND } from '../config/conexasoft-brand.js';

const PAGE_MARGIN = 40;
const STATUS_BAR_H = 18;
const FOOTER_Y = 792 - PAGE_MARGIN - STATUS_BAR_H;
const SIGNATURE_H = 88;
const DEFAULT_BRAND = { ...CONEXASOFT_INVOICE_BRAND };

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function mixWithWhite(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_BRAND.lightFill;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(rgb.r), mix(rgb.g), mix(rgb.b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function resolveBrand(company = {}) {
  const primary = company.themePrimary || company.theme_primary || DEFAULT_BRAND.primary;
  const secondary = company.themeSecondary || company.theme_secondary || DEFAULT_BRAND.secondary;
  const accent = company.themeAccent || company.theme_accent || DEFAULT_BRAND.accent;
  return {
    primary,
    secondary,
    accent,
    lightFill: mixWithWhite(primary, 0.88),
    altFill: mixWithWhite(primary, 0.72),
    tableHead: mixWithWhite(primary, 0.78),
    border: mixWithWhite(primary, 0.45),
    label: DEFAULT_BRAND.label,
  };
}

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

function formatDate(value) {
  if (!value) return '—';
  const raw = String(value);
  const d = new Date(raw.length === 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return d.toLocaleDateString('es-CO');
}

function documentTitle(kind) {
  if (kind === 'prefactura') return 'PREFACTURA';
  return 'COTIZACIÓN';
}

function formatPrintDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function userCode(user) {
  const email = String(user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return email;
}

function userName(user) {
  return String(user?.full_name || user?.fullName || '').trim().toUpperCase();
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

function drawCompanyHeader(doc, company, title, pageWidth, brand) {
  const logoPath = resolveCompanyLogoAbsolute(company.logoPath || company.logo_path);
  const logoW = 78;
  const logoH = 58;
  let y = PAGE_MARGIN;
  let headerBottom = y;

  const headerBarH = 36;
  doc.save();
  doc.rect(PAGE_MARGIN, y, pageWidth, headerBarH).fill(brand.secondary);
  doc.fillColor(brand.accent).font('Helvetica-Bold').fontSize(12)
    .text(title, PAGE_MARGIN + 12, y + 11, { width: pageWidth - 24, align: 'center' });
  doc.restore();
  y += headerBarH;
  doc.rect(PAGE_MARGIN, y, pageWidth, 3).fill(brand.primary);
  y += 10;

  if (logoPath) {
    try {
      doc.image(logoPath, PAGE_MARGIN, y, { fit: [logoW, logoH], align: 'center', valign: 'center' });
      headerBottom = Math.max(headerBottom, y + logoH);
    } catch {
      // continuar sin logo
    }
  } else {
    headerBottom = y;
  }

  const textX = logoPath ? PAGE_MARGIN + logoW + 14 : PAGE_MARGIN;
  const textW = logoPath ? pageWidth - logoW - 14 : pageWidth;
  const textTop = y;

  doc.font('Helvetica-Bold').fontSize(14).fillColor(brand.primary)
    .text(company.name || '—', textX, textTop + 6, { width: textW });
  let textY = textTop + 24;
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
  headerBottom = Math.max(headerBottom, textY, y + (logoPath ? logoH : 0));

  y = headerBottom + 10;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + pageWidth, y).strokeColor(brand.primary).lineWidth(1.5).stroke();
  return y + 14;
}

function drawInfoCard(doc, y, pageWidth, fields, brand) {
  const cardPadding = 10;
  const colCount = 2;
  const colW = (pageWidth - cardPadding * 2) / colCount;
  const rowsNeeded = Math.ceil(fields.length / colCount);
  const rowH = 30;
  const cardH = cardPadding * 2 + rowsNeeded * rowH;

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, pageWidth, cardH, 4).fill(brand.lightFill);
  doc.roundedRect(PAGE_MARGIN, y, pageWidth, cardH, 4).lineWidth(0.8).strokeColor(brand.border).stroke();
  doc.restore();

  fields.forEach((field, idx) => {
    const col = idx % colCount;
    const row = Math.floor(idx / colCount);
    const fx = PAGE_MARGIN + cardPadding + col * colW;
    const fy = y + cardPadding + row * rowH;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(brand.label).text(field.label, fx, fy, { width: colW - 8 });
    doc.font('Helvetica').fontSize(9).fillColor('#212121').text(field.value || '—', fx, fy + 10, { width: colW - 8 });
  });

  return y + cardH + 12;
}

function drawTableHeader(doc, y, headers, colDefs, pageWidth, brand) {
  const cols = scaleCols(colDefs, pageWidth);
  doc.save();
  doc.rect(PAGE_MARGIN, y, pageWidth, 18).fill(brand.tableHead);
  doc.restore();
  let x = PAGE_MARGIN + 4;
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.secondary)
      .text(h, x, y + 5, { width: cols[i] - 6 });
    x += cols[i];
  });
  return { y: y + 18, cols };
}

function drawTableRow(doc, y, values, cols, pageWidth, { stripe = false } = {}) {
  if (stripe) {
    doc.save();
    doc.rect(PAGE_MARGIN, y, pageWidth, 16).fill('#FAFAFA');
    doc.restore();
  }
  let x = PAGE_MARGIN + 4;
  values.forEach((val, i) => {
    doc.font('Helvetica').fontSize(8).fillColor('#212121')
      .text(String(val ?? '—'), x, y + 4, { width: cols[i] - 6, align: i >= values.length - 2 ? 'right' : 'left' });
    x += cols[i];
  });
  return y + 16;
}

function drawSignatureBlock(doc, y, pageWidth, brand, preparedBy) {
  const boxH = SIGNATURE_H;
  const colW = pageWidth / 3;
  const code = userCode(preparedBy);
  const name = userName(preparedBy);

  doc.save();
  doc.roundedRect(PAGE_MARGIN, y, pageWidth, boxH, 3).lineWidth(0.9).strokeColor('#212121').stroke();
  doc.moveTo(PAGE_MARGIN + colW, y).lineTo(PAGE_MARGIN + colW, y + boxH).stroke();
  doc.moveTo(PAGE_MARGIN + colW * 2, y).lineTo(PAGE_MARGIN + colW * 2, y + boxH).stroke();
  doc.restore();

  const cells = [
    {
      title: 'ELABORADO',
      lines: [
        code ? `CODIGO: ${code}` : '',
        name ? `NOMBRE: ${name}` : '',
      ].filter(Boolean),
    },
    { title: 'REVISADO', lines: [] },
    { title: 'AUTORIZADO', lines: [] },
  ];

  cells.forEach((cell, i) => {
    const x = PAGE_MARGIN + i * colW;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#212121')
      .text(cell.title, x + 8, y + 8, { width: colW - 16, align: 'center' });
    let ty = y + 24;
    cell.lines.forEach((line) => {
      doc.font('Helvetica').fontSize(7).fillColor('#212121')
        .text(line, x + 8, ty, { width: colW - 16 });
      ty += 11;
    });
    const lineY = y + boxH - 18;
    doc.moveTo(x + 14, lineY).lineTo(x + colW - 14, lineY).strokeColor('#9E9E9E').lineWidth(0.6).stroke();
    doc.font('Helvetica').fontSize(6).fillColor('#9E9E9E')
      .text('Firma', x + 8, lineY + 3, { width: colW - 16, align: 'center' });
  });

  return y + boxH + 8;
}

function drawPrintBar(doc, pageWidth, printedBy, printedAt, page, pages, brand) {
  const y = FOOTER_Y;
  doc.save();
  doc.rect(PAGE_MARGIN, y, pageWidth, STATUS_BAR_H).fill(brand.lightFill);
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + pageWidth, y).strokeColor('#212121').lineWidth(0.6).stroke();
  doc.restore();

  const printedCode = userCode(printedBy) || userName(printedBy) || '—';
  const left = `Impreso Por: ${printedCode}`;
  const center = `Fecha y Hora de Impresión: ${formatPrintDateTime(printedAt)}`;
  const right = `Página ${page} de ${pages}`;

  doc.font('Helvetica').fontSize(7).fillColor('#212121');
  doc.text(left, PAGE_MARGIN + 6, y + 5, { width: pageWidth / 3 - 8, align: 'left' });
  doc.text(center, PAGE_MARGIN + pageWidth / 3, y + 5, { width: pageWidth / 3, align: 'center' });
  doc.text(right, PAGE_MARGIN + (pageWidth * 2) / 3, y + 5, { width: pageWidth / 3 - 6, align: 'right' });
}

export function buildSalesDocumentPdfFileName(document) {
  const kind = document.documentKind === 'prefactura' ? 'Prefactura' : 'Cotizacion';
  const num = document.internalNumber || document.id;
  return `${kind}-${num}.pdf`;
}

export function buildSalesDocumentPdf({ company, document, client, preparedBy = null, printedBy = null }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    const title = documentTitle(document.documentKind);
    const brand = resolveBrand(company);
    const printer = printedBy || preparedBy;
    const printedAt = new Date();
    let y = drawCompanyHeader(doc, company, title, pageWidth, brand);

    const clientLabel = client?.fullName || document.clientName || '—';
    const clientDoc = client?.documentDisplay || client?.documentNumber || document.clientDocument || '';

    const fields = [
      { label: 'NÚMERO', value: document.internalNumber || '—' },
      { label: 'FECHA', value: formatDate(document.issueDate || document.createdAt) },
      { label: 'CLIENTE', value: clientLabel },
      { label: 'DOCUMENTO CLIENTE', value: clientDoc || '—' },
      { label: 'VÁLIDA HASTA', value: formatDate(document.dueDate) },
      { label: 'TOTAL', value: `$${money(document.total)}` },
    ];
    y = drawInfoCard(doc, y, pageWidth, fields, brand);

    const details = document.details || [];
    doc.font('Helvetica-Bold').fontSize(10).fillColor(brand.primary)
      .text(`Detalle (${details.length} ${details.length === 1 ? 'línea' : 'líneas'})`, PAGE_MARGIN, y);
    y += 14;

    const colDefs = [70, 200, 50, 80, 60, 80];
    const headers = ['Código', 'Descripción', 'Cant.', 'Precio', 'IVA %', 'Total'];
    const { y: tableY, cols } = drawTableHeader(doc, y, headers, colDefs, pageWidth, brand);
    y = tableY;

    details.forEach((line, idx) => {
      y = ensureSpace(doc, y, 18);
      y = drawTableRow(doc, y, [
        line.itemCode || '—',
        line.description || '—',
        qty(line.quantity),
        `$${money(line.unitPrice)}`,
        `${Number(line.taxRate) || 0}%`,
        `$${money(line.lineTotal)}`,
      ], cols, pageWidth, { stripe: idx % 2 === 1 });
    });

    y = ensureSpace(doc, y, 50);
    const summaryX = PAGE_MARGIN + pageWidth - 220;
    doc.font('Helvetica').fontSize(9).fillColor('#424242');
    doc.text('Subtotal:', summaryX, y, { width: 100, align: 'right' });
    doc.text(`$${money(document.subtotal)}`, summaryX + 105, y, { width: 80, align: 'right' });
    y += 14;
    doc.text('IVA:', summaryX, y, { width: 100, align: 'right' });
    doc.text(`$${money(document.taxAmount)}`, summaryX + 105, y, { width: 80, align: 'right' });
    y += 16;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(brand.primary);
    doc.text('TOTAL:', summaryX, y, { width: 100, align: 'right' });
    doc.text(`$${money(document.total)}`, summaryX + 105, y, { width: 80, align: 'right' });

    if (document.notes?.trim()) {
      y += 28;
      y = ensureSpace(doc, y, 40);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#616161').text('Observaciones', PAGE_MARGIN, y);
      y += 12;
      doc.font('Helvetica').fontSize(9).fillColor('#424242')
        .text(document.notes.trim(), PAGE_MARGIN, y, { width: pageWidth });
      y = doc.y + 8;
    } else {
      y += 28;
    }

    y = ensureSpace(doc, y, SIGNATURE_H + 12);
    drawSignatureBlock(doc, y, pageWidth, brand, preparedBy);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      drawPrintBar(doc, pageWidth, printer, printedAt, i + 1, range.count, brand);
    }

    doc.end();
  });
}
