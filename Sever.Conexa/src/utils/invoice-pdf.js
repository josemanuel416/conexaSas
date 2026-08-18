/** Representación gráfica PDF — factura electrónica DIAN (software propio) */

import fs from 'fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { dianEnvironmentLabel as envLabel } from './dian-environment.js';
import { resolveProjectPath } from '../project-root.js';
import { CONEXASOFT_INVOICE_BRAND } from '../config/conexasoft-brand.js';

const PAGE_MARGIN = 40;

const DEFAULT_BRAND = { ...CONEXASOFT_INVOICE_BRAND };

const DOC_TYPE_LABELS = {
  13: 'C.C.',
  31: 'NIT',
  22: 'C.E.',
  41: 'Pasaporte',
  47: 'PEP',
};

function resolveBrand(company) {
  return {
    primary: company.themePrimary || DEFAULT_BRAND.primary,
    secondary: company.themeSecondary || DEFAULT_BRAND.secondary,
    accent: company.themeAccent || DEFAULT_BRAND.accent,
    lightFill: DEFAULT_BRAND.lightFill,
    altFill: DEFAULT_BRAND.altFill,
    border: DEFAULT_BRAND.border,
    label: DEFAULT_BRAND.label,
    tableHead: DEFAULT_BRAND.tableHead,
  };
}

function resolveLogoPath(logoPath) {
  const candidate = resolveProjectPath(logoPath);
  return candidate && fs.existsSync(candidate) ? candidate : null;
}

function money(value) {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateEs(value) {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeEs(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/(\d{2}:\d{2}(?::\d{2})?)/);
  return match ? match[1] : raw.slice(0, 8);
}

function formatDateTimeEs(dateValue, timeValue) {
  const datePart = formatDateEs(dateValue);
  const timePart = formatTimeEs(timeValue);
  return timePart && timePart !== '—' ? `${datePart} ${timePart}` : datePart;
}

function paymentFormLabel(invoice) {
  if (!invoice.dueDate || !invoice.issueDate) return 'Contado';
  const issue = toDate(invoice.issueDate);
  const due = toDate(invoice.dueDate);
  if (issue && due && due.getTime() > issue.getTime()) return 'Crédito';
  return 'Contado';
}

function nitDisplay(nit, dv) {
  const n = String(nit || '').replace(/\D/g, '');
  if (!n) return '—';
  return dv != null && dv !== '' ? `${n}-${dv}` : n;
}

function clientDocLabel(client) {
  const type = DOC_TYPE_LABELS[client.documentType] || 'Doc.';
  const num = client.documentDisplay || client.documentNumber || '—';
  return `${type} ${num}`;
}

function extractSignedMeta(signedXml) {
  if (!signedXml) return {};
  const qrText = signedXml.match(/<sts:QRCode>([\s\S]*?)<\/sts:QRCode>/i)?.[1]?.trim() || '';
  const cufe = signedXml.match(/<cbc:UUID[^>]*schemeName="CUFE-SHA384"[^>]*>([^<]+)<\/cbc:UUID>/i)?.[1]?.trim()
    || signedXml.match(/<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/i)?.[1]?.trim();
  return { qrText, cufe };
}

function buildQrPayload({ invoice, company, client, resolution, signedMeta }) {
  if (signedMeta.qrText?.startsWith('http')) return signedMeta.qrText;
  const cufe = signedMeta.cufe || invoice.cufe;
  if (cufe && resolution?.dianEnvironment === 'produccion') {
    return `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`;
  }
  if (signedMeta.qrText) return signedMeta.qrText;
  if (cufe && resolution?.dianEnvironment !== 'produccion') {
    return `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${cufe}`;
  }
  const issueDate = String(invoice.issueDate || '').slice(0, 10);
  return [
    `NroFactura=${invoice.fullNumber || invoice.internalNumber}`,
    `NitFacturador=${company.nit}`,
    `NitAdquiriente=${client.documentNumber || ''}`,
    `FechaFactura=${issueDate}`,
    `ValorTotalFactura=${Number(invoice.total || 0).toFixed(2)}`,
  ].join(', ');
}

function groupTaxes(details) {
  const map = new Map();
  for (const line of details) {
    const rate = Number(line.taxRate) || 0;
    const base = Math.max(0, (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
      - (Number(line.discountAmount) || 0));
    const tax = Number(line.taxAmount) || Math.round(base * (rate / 100) * 100) / 100;
    const prev = map.get(rate) || { rate, base: 0, tax: 0 };
    prev.base += base;
    prev.tax += tax;
    map.set(rate, prev);
  }
  return [...map.values()].sort((a, b) => a.rate - b.rate);
}

function drawBox(doc, x, y, w, h, fill, borderColor = '#cfd8dc') {
  doc.save();
  doc.rect(x, y, w, h).fill(fill);
  doc.rect(x, y, w, h).stroke(borderColor);
  doc.restore();
}

function drawInlinePair(doc, x, y, w, leftLabel, leftValue, rightLabel, rightValue, labelColor = '#546e7a') {
  const half = w / 2 - 4;
  doc.font('Helvetica-Bold').fontSize(7).fillColor(labelColor).text(leftLabel, x, y, { width: half });
  doc.font('Helvetica').fontSize(8).fillColor('#212121').text(leftValue, x, y + 9, { width: half });
  doc.font('Helvetica-Bold').fontSize(7).fillColor(labelColor).text(rightLabel, x + half + 8, y, { width: half });
  doc.font('Helvetica').fontSize(8).fillColor('#212121').text(rightValue, x + half + 8, y + 9, { width: half });
}

function measureTableRow(doc, cols, values) {
  let maxH = 12;
  values.forEach((val, idx) => {
    const h = doc.heightOfString(String(val ?? '—'), {
      width: cols[idx].w - 6,
      align: cols[idx].align || 'left',
    });
    maxH = Math.max(maxH, h);
  });
  return maxH + 8;
}

function drawTableRow(doc, x, y, pageWidth, cols, values, borderColor = '#e0e0e0') {
  const rowH = measureTableRow(doc, cols, values);
  doc.rect(x, y, pageWidth, rowH).stroke(borderColor);
  let cx = x + 4;
  values.forEach((val, idx) => {
    doc.font('Helvetica').fontSize(8).fillColor('#212121')
      .text(String(val ?? '—'), cx, y + 4, {
        width: cols[idx].w - 6,
        align: cols[idx].align || 'left',
        lineBreak: true,
      });
    cx += cols[idx].w;
  });
  return rowH;
}

/**
 * @param {{
 *   invoice: object,
 *   company: object,
 *   client: object,
 *   resolution: object,
 *   signedXml?: string,
 * }} params
 * @returns {Promise<Buffer>}
 */
export async function buildInvoicePdf({
  invoice,
  company,
  client,
  resolution,
  signedXml,
}) {
  const signedMeta = extractSignedMeta(signedXml);
  const cufe = signedMeta.cufe || invoice.cufe || '';
  const qrPayload = buildQrPayload({ invoice, company, client, resolution, signedMeta });
  const qrBuffer = await QRCode.toBuffer(qrPayload, { margin: 1, width: 140 });
  const taxGroups = groupTaxes(invoice.details || []);
  const docTitle = invoice.documentKind === 'nota_credito'
    ? 'NOTA CRÉDITO ELECTRÓNICA'
    : 'FACTURA ELECTRÓNICA DE VENTA';
  const currency = invoice.currency || 'COP';
  const paymentForm = paymentFormLabel(invoice);
  const clientAddress = [client.address, client.cityName, client.departmentName].filter(Boolean).join(', ') || '—';
  const clientContact = [client.phone ? `Tel. ${client.phone}` : null, client.email].filter(Boolean).join(' · ') || '—';
  const brand = resolveBrand(company);
  const logoPath = resolveLogoPath(company.logoPath);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    let y = PAGE_MARGIN;

    const headerBarH = 44;

    doc.save();
    doc.rect(PAGE_MARGIN, y, pageWidth, headerBarH).fill(brand.secondary);
    doc.fillColor(brand.accent).font('Helvetica-Bold').fontSize(12)
      .text(docTitle, PAGE_MARGIN + 12, y + 14, { width: pageWidth - 24, align: 'center' });
    doc.restore();
    y += headerBarH;
    doc.rect(PAGE_MARGIN, y, pageWidth, 3).fill(brand.primary);
    y += 9;

    const colW = pageWidth / 2 - 6;
    const headerH = 88;
    const emisorLogoW = 76;
    const emisorLogoH = 68;
    const emisorTextW = colW - emisorLogoW - 22;
    drawBox(doc, PAGE_MARGIN, y, colW, headerH, brand.lightFill, brand.border);
    drawBox(doc, PAGE_MARGIN + colW + 12, y, colW, headerH, brand.altFill, brand.border);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#212121')
      .text(company.name || 'Emisor', PAGE_MARGIN + 10, y + 10, { width: emisorTextW });
    let emY = y + 26;
    doc.font('Helvetica').fontSize(9).fillColor('#424242')
      .text(`NIT: ${nitDisplay(company.nit, company.verificationDigit)}`, PAGE_MARGIN + 10, emY, { width: emisorTextW });
    emY += 13;
    if (company.address) {
      doc.text(company.address, PAGE_MARGIN + 10, emY, { width: emisorTextW });
      emY += 13;
    }
    if (company.phone) {
      doc.text(`Tel. ${company.phone}`, PAGE_MARGIN + 10, emY, { width: emisorTextW });
      emY += 13;
    }
    if (company.email) {
      doc.text(company.email, PAGE_MARGIN + 10, emY, { width: emisorTextW });
    }

    if (logoPath) {
      const logoX = PAGE_MARGIN + colW - emisorLogoW - 8;
      const logoY = y + (headerH - emisorLogoH) / 2;
      doc.image(logoPath, logoX, logoY, { fit: [emisorLogoW, emisorLogoH], align: 'center', valign: 'center' });
    }

    const rx = PAGE_MARGIN + colW + 22;
    const rw = colW - 20;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('Número', rx, y + 10, { width: rw });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#212121')
      .text(invoice.fullNumber || invoice.internalNumber || '—', rx, y + 20, { width: rw });
    drawInlinePair(
      doc,
      rx,
      y + 40,
      rw,
      'Fecha emisión',
      formatDateTimeEs(invoice.issueDate, invoice.issueTime),
      'Fecha vencimiento',
      formatDateEs(invoice.dueDate),
      brand.label
    );
    drawInlinePair(
      doc,
      rx,
      y + 62,
      rw,
      'Moneda',
      currency,
      'Forma de pago',
      paymentForm,
      brand.label
    );
    y += headerH + 10;

    const clientBoxH = 58;
    drawBox(doc, PAGE_MARGIN, y, pageWidth, clientBoxH, brand.lightFill, brand.border);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(brand.primary).text('CLIENTE', PAGE_MARGIN + 10, y + 8);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#212121')
      .text(client.fullName || client.registrationName || invoice.clientName || '—', PAGE_MARGIN + 10, y + 22, {
        width: pageWidth * 0.55,
      });
    doc.font('Helvetica').fontSize(8).fillColor('#424242')
      .text(clientDocLabel(client), PAGE_MARGIN + pageWidth * 0.58, y + 22, { width: pageWidth * 0.38, align: 'right' })
      .text(clientAddress, PAGE_MARGIN + 10, y + 36, { width: pageWidth * 0.62 })
      .text(clientContact, PAGE_MARGIN + pageWidth * 0.58, y + 36, { width: pageWidth * 0.38, align: 'right' });
    y += clientBoxH + 10;

    const cols = [
      { label: '#', w: 22, align: 'center' },
      { label: 'Código', w: 68 },
      { label: 'Descripción', w: pageWidth - 22 - 68 - 36 - 66 - 36 - 66 - 16 },
      { label: 'Cant.', w: 36, align: 'right' },
      { label: 'V. Unit.', w: 66, align: 'right' },
      { label: 'IVA %', w: 36, align: 'right' },
      { label: 'Total', w: 66, align: 'right' },
    ];

    doc.save();
    doc.rect(PAGE_MARGIN, y, pageWidth, 18).fill(brand.tableHead);
    let cx = PAGE_MARGIN + 4;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.secondary);
    for (const col of cols) {
      doc.text(col.label, cx, y + 5, { width: col.w - 4, align: col.align || 'left' });
      cx += col.w;
    }
    doc.restore();
    y += 18;

    for (const line of invoice.details || []) {
      if (y > doc.page.height - 220) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
      const values = [
        String(line.lineNumber),
        line.itemCode || '—',
        line.description || '—',
        String(line.quantity),
        money(line.unitPrice),
        `${Number(line.taxRate || 0).toFixed(0)}%`,
        money(line.lineTotal),
      ];
      y += drawTableRow(doc, PAGE_MARGIN, y, pageWidth, cols, values, brand.border);
    }
    y += 10;

    const totalsX = PAGE_MARGIN + pageWidth - 220;
    const totalsW = 220;
    drawBox(doc, totalsX, y, totalsW, 78, brand.lightFill, brand.border);
    let ty = y + 8;
    const totalRows = [
      ['Subtotal', money(invoice.subtotal)],
      ['Descuento', money(invoice.discountAmount)],
      ['IVA', money(invoice.taxAmount)],
      ['TOTAL', money(invoice.total)],
    ];
    for (const [label, val] of totalRows) {
      const bold = label === 'TOTAL';
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9)
        .fillColor(bold ? brand.primary : '#424242')
        .text(label, totalsX + 10, ty, { width: 90 })
        .text(`$ ${val}`, totalsX + 100, ty, { width: totalsW - 110, align: 'right' });
      ty += bold ? 18 : 14;
    }
    y += 88;

    if (taxGroups.length) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('Desglose IVA', PAGE_MARGIN, y);
      y += 12;
      for (const tg of taxGroups) {
        doc.font('Helvetica').fontSize(8).fillColor('#424242')
          .text(`Base gravable $ ${money(tg.base)} · Tarifa ${tg.rate.toFixed(0)}% · IVA $ ${money(tg.tax)}`, PAGE_MARGIN, y, { width: pageWidth - 230 });
        y += 12;
      }
      y += 4;
    }

    if (invoice.notes) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('Observaciones', PAGE_MARGIN, y);
      doc.font('Helvetica').fontSize(8).fillColor('#424242').text(invoice.notes, PAGE_MARGIN, y + 12, { width: pageWidth - 230 });
      y += 28;
    }

    const qrBoxH = cufe ? 96 : 78;
    drawBox(doc, PAGE_MARGIN, y, pageWidth, qrBoxH, brand.altFill, brand.border);
    doc.image(qrBuffer, PAGE_MARGIN + pageWidth - 130, y + 8, { width: 72, height: 72 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('Código QR', PAGE_MARGIN + pageWidth - 130, y + 82, { width: 72, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('CUFE / CUDS', PAGE_MARGIN + 10, y + 10);
    if (cufe) {
      doc.font('Helvetica').fontSize(7).fillColor('#212121').text(cufe, PAGE_MARGIN + 10, y + 24, { width: pageWidth - 150 });
    } else {
      doc.font('Helvetica').fontSize(8).fillColor('#757575').text('Disponible tras validación DIAN', PAGE_MARGIN + 10, y + 24);
    }

    doc.font('Helvetica').fontSize(7).fillColor('#607d8b')
      .text(
        'Representación gráfica de documento electrónico generada por software propio (Conexa). '
        + 'La validez jurídica corresponde al XML firmado y a la respuesta de la DIAN.',
        PAGE_MARGIN + 10,
        y + (cufe ? 54 : 42),
        { width: pageWidth - 150 }
      );
    y += qrBoxH + 10;

    drawBox(doc, PAGE_MARGIN, y, pageWidth, 46, brand.lightFill, brand.border);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('Resolución DIAN', PAGE_MARGIN + 10, y + 8);
    doc.font('Helvetica').fontSize(8).fillColor('#212121')
      .text(
        `No. ${resolution.resolutionNumber || '—'} del ${formatDateEs(resolution.resolutionDate)} · Prefijo ${resolution.prefix || '—'} · Rango ${resolution.rangeFrom ?? '—'} - ${resolution.rangeTo ?? '—'}`,
        PAGE_MARGIN + 10,
        y + 20,
        { width: pageWidth - 20 }
      )
      .text(
        `Vigencia ${formatDateEs(resolution.validFrom)} — ${formatDateEs(resolution.validTo)} · Ambiente ${envLabel(resolution.dianEnvironment)}`,
        PAGE_MARGIN + 10,
        y + 32,
        { width: pageWidth - 20 }
      );
    y += 56;

    doc.font('Helvetica').fontSize(7).fillColor(brand.label)
      .text(
        `Generado ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`,
        PAGE_MARGIN,
        y,
        { width: pageWidth, align: 'center' }
      );

    doc.end();
  });
}

export function buildInvoicePdfFileName(invoice) {
  const number = invoice.fullNumber || invoice.internalNumber || invoice.id;
  return `FE-${number}.pdf`;
}
