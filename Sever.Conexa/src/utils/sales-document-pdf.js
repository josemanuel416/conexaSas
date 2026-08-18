import PDFDocument from 'pdfkit';
import { resolveCompanyLogoAbsolute } from './company-logo.js';

const PAGE_MARGIN = 40;
const FOOTER_Y = 740;
const BRAND = '#1565C0';

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
  const logoPath = resolveCompanyLogoAbsolute(company.logoPath || company.logo_path);
  const logoW = 78;
  const logoH = 58;
  let y = PAGE_MARGIN;
  let headerBottom = y;

  if (logoPath) {
    try {
      doc.image(logoPath, PAGE_MARGIN, y, { fit: [logoW, logoH], align: 'center', valign: 'center' });
      headerBottom = Math.max(headerBottom, y + logoH);
    } catch {
      // continuar sin logo
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

function drawInfoCard(doc, y, pageWidth, fields) {
  const cardPadding = 10;
  const colCount = 2;
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
    const fx = PAGE_MARGIN + cardPadding + col * colW;
    const fy = y + cardPadding + row * rowH;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#757575').text(field.label, fx, fy, { width: colW - 8 });
    doc.font('Helvetica').fontSize(9).fillColor('#212121').text(field.value || '—', fx, fy + 10, { width: colW - 8 });
  });

  return y + cardH + 12;
}

function drawTableHeader(doc, y, headers, colDefs, pageWidth) {
  const cols = scaleCols(colDefs, pageWidth);
  doc.save();
  doc.rect(PAGE_MARGIN, y, pageWidth, 18).fill('#ECEFF1');
  doc.restore();
  let x = PAGE_MARGIN + 4;
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#37474F')
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

function drawFooter(doc, pageWidth, text) {
  doc.font('Helvetica').fontSize(8).fillColor('#9E9E9E')
    .text(text, PAGE_MARGIN, FOOTER_Y, { width: pageWidth, align: 'center' });
}

export function buildSalesDocumentPdfFileName(document) {
  const kind = document.documentKind === 'prefactura' ? 'Prefactura' : 'Cotizacion';
  const num = document.internalNumber || document.id;
  return `${kind}-${num}.pdf`;
}

export function buildSalesDocumentPdf({ company, document, client }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    const title = documentTitle(document.documentKind);
    let y = drawCompanyHeader(doc, company, title, pageWidth);

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
    y = drawInfoCard(doc, y, pageWidth, fields);

    const details = document.details || [];
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND)
      .text(`Detalle (${details.length} ${details.length === 1 ? 'línea' : 'líneas'})`, PAGE_MARGIN, y);
    y += 14;

    const colDefs = [70, 200, 50, 80, 60, 80];
    const headers = ['Código', 'Descripción', 'Cant.', 'Precio', 'IVA %', 'Total'];
    const { y: tableY, cols } = drawTableHeader(doc, y, headers, colDefs, pageWidth);
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
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND);
    doc.text('TOTAL:', summaryX, y, { width: 100, align: 'right' });
    doc.text(`$${money(document.total)}`, summaryX + 105, y, { width: 80, align: 'right' });

    if (document.notes?.trim()) {
      y += 28;
      y = ensureSpace(doc, y, 40);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#616161').text('Observaciones', PAGE_MARGIN, y);
      y += 12;
      doc.font('Helvetica').fontSize(9).fillColor('#424242')
        .text(document.notes.trim(), PAGE_MARGIN, y, { width: pageWidth });
    }

    drawFooter(doc, pageWidth, `${title} — documento comercial`);
    doc.end();
  });
}
