import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { resolveCompanyLogoAbsolute } from './company-logo.js';
import { CONEXASOFT_INVOICE_BRAND } from '../config/conexasoft-brand.js';
import { formatDateEs as formatDate, formatPrintDateTime } from './app-timezone.js';
import { extractDsSignedMeta, buildDsQrPayload } from './fcxp-pdf.js';

const PAGE_MARGIN = 40;
const STATUS_BAR_H = 18;
const FOOTER_Y = 792 - PAGE_MARGIN - STATUS_BAR_H;
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

function userCode(user) {
  const email = String(user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return email || String(user?.fullName || user?.full_name || '').trim();
}

function notaTipoLabel(tipoNota) {
  return tipoNota === 'CR' ? 'CRÉDITO' : 'DÉBITO';
}

function notaStatusLabel(status) {
  const map = {
    confirmada: 'Confirmada',
    enviada_dian: 'Enviada DIAN',
    aprobada_dian: 'Aprobada DIAN',
    rechazada_dian: 'Rechazada DIAN',
    anulada: 'Anulada',
  };
  return map[status] || status || '—';
}

export function buildFcxpNotaPdfFileName(nota) {
  const num = nota.cnsDocAjuste || `item-${nota.item}`;
  return `NAS-${nota.tipoNota || 'DB'}-${num}.pdf`;
}

export async function buildFcxpNotaPdf({
  company,
  fcxp,
  nota,
  printedBy = null,
  signedXml = null,
  dianEnvironment = '',
}) {
  const signedMeta = extractDsSignedMeta(signedXml);
  const cuds = signedMeta.cuds || nota.cude || '';
  const qrPayload = buildDsQrPayload({
    fcxp,
    signedMeta,
    dianEnvironment,
    cudsOverride: nota.cude || '',
  });
  const qrBuffer = qrPayload
    ? await QRCode.toBuffer(qrPayload, { margin: 1, width: 140 })
    : null;

  const conceptoLabel = nota.concepto
    ? `${nota.concepto}${nota.dianCode ? ` (DIAN ${nota.dianCode})` : ''}`
    : (nota.detalle || '—');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    const brand = resolveBrand(company);
    const printedAt = new Date();
    let y = PAGE_MARGIN;

    doc.save();
    doc.rect(PAGE_MARGIN, y, pageWidth, 40).fill(brand.secondary);
    doc.fillColor(brand.accent).font('Helvetica-Bold').fontSize(11)
      .text('NOTA DE AJUSTE AL DOCUMENTO SOPORTE', PAGE_MARGIN + 12, y + 8, { width: pageWidth - 24, align: 'center' });
    doc.fontSize(10)
      .text(`TIPO ${notaTipoLabel(nota.tipoNota)}`, PAGE_MARGIN + 12, y + 22, { width: pageWidth - 24, align: 'center' });
    doc.restore();
    y += 40;
    doc.rect(PAGE_MARGIN, y, pageWidth, 3).fill(brand.primary);
    y += 12;

    const logoPath = resolveCompanyLogoAbsolute(company.logoPath || company.logo_path);
    const logoW = 78;
    const logoH = 52;
    let headerBottom = y;
    if (logoPath) {
      try {
        doc.image(logoPath, PAGE_MARGIN, y, { fit: [logoW, logoH] });
        headerBottom = y + logoH;
      } catch { /* sin logo */ }
    }
    const textX = logoPath ? PAGE_MARGIN + logoW + 14 : PAGE_MARGIN;
    const textW = logoPath ? pageWidth - logoW - 14 : pageWidth;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(brand.primary)
      .text(company.name || '—', textX, y + 4, { width: textW });
    let textY = y + 22;
    if (company.nit) {
      doc.font('Helvetica').fontSize(9).fillColor('#616161')
        .text(`NIT ${company.nit}${company.verificationDigit ? `-${company.verificationDigit}` : ''}`, textX, textY, { width: textW });
      textY += 12;
    }
    if (company.address) {
      doc.text(company.address, textX, textY, { width: textW });
      textY += 12;
    }
    y = Math.max(headerBottom, textY) + 10;
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + pageWidth, y).strokeColor(brand.primary).lineWidth(1.4).stroke();
    y += 12;

    const fields = [
      { label: 'NÚMERO NAS', value: nota.cnsDocAjuste || `#${nota.item}` },
      { label: 'FECHA NOTA', value: formatDate(nota.fechaNota || nota.issueDate) },
      { label: 'ESTADO', value: notaStatusLabel(nota.status) },
      { label: 'CONCEPTO', value: conceptoLabel },
      { label: 'DOC. SOPORTE REF.', value: fcxp.cnsDocSoporte || '—' },
      { label: 'PROVEEDOR', value: fcxp.terceroNombre || '—' },
      { label: 'DOCUMENTO PROVEEDOR', value: fcxp.terceroDocumento || '—' },
      { label: 'CxP', value: fcxp.cnsFcxp ? `CXP-${String(fcxp.cnsFcxp).padStart(6, '0')}` : '—' },
    ];
    const cardH = 102;
    doc.save();
    doc.roundedRect(PAGE_MARGIN, y, pageWidth, cardH, 4).fill(brand.lightFill);
    doc.roundedRect(PAGE_MARGIN, y, pageWidth, cardH, 4).lineWidth(0.8).strokeColor(brand.border).stroke();
    doc.restore();
    fields.forEach((field, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const fx = PAGE_MARGIN + 10 + col * ((pageWidth - 20) / 2);
      const fy = y + 8 + row * 24;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(brand.label).text(field.label, fx, fy, { width: pageWidth / 2 - 20 });
      doc.font('Helvetica').fontSize(9).fillColor('#212121').text(field.value, fx, fy + 10, { width: pageWidth / 2 - 20 });
    });
    y += cardH + 14;

    if (nota.detalle) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('OBSERVACIONES', PAGE_MARGIN, y);
      doc.font('Helvetica').fontSize(9).fillColor('#212121')
        .text(nota.detalle, PAGE_MARGIN, y + 12, { width: pageWidth });
      y += doc.heightOfString(nota.detalle, { width: pageWidth }) + 18;
    }

    const drawHeader = (headers, cols, top) => {
      doc.save();
      doc.rect(PAGE_MARGIN, top, pageWidth, 18).fill(brand.tableHead);
      doc.restore();
      let x = PAGE_MARGIN + 4;
      headers.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.secondary)
          .text(h, x, top + 5, { width: cols[i] - 6, align: i >= 2 ? 'right' : 'left' });
        x += cols[i];
      });
      return top + 18;
    };

    if (nota.mdetalle && (nota.details || []).length) {
      const lineHeaders = ['#', 'Descripción', 'Base', 'IVA'];
      const lineCols = [28, pageWidth - 28 - 90 - 90, 90, 90];
      y = drawHeader(lineHeaders, lineCols, y);
      nota.details.forEach((line, idx) => {
        if (y > FOOTER_Y - 24) {
          doc.addPage();
          y = PAGE_MARGIN;
          y = drawHeader(lineHeaders, lineCols, y);
        }
        const values = [
          String(line.fcxpdItem ?? idx + 1),
          line.descripcion || '—',
          `$${money(line.vlrAfecta)}`,
          `$${money(line.vlrIva)}`,
        ];
        if (idx % 2 === 1) {
          doc.save();
          doc.rect(PAGE_MARGIN, y, pageWidth, 16).fill('#FAFAFA');
          doc.restore();
        }
        let x = PAGE_MARGIN + 4;
        values.forEach((val, i) => {
          doc.font('Helvetica').fontSize(8).fillColor('#212121')
            .text(val, x, y + 4, { width: lineCols[i] - 6, align: i >= 2 ? 'right' : 'left' });
          x += lineCols[i];
        });
        y += 16;
      });
      y += 12;
    }

    if (nota.afectaImp && (nota.taxes || []).length) {
      const taxHeaders = ['Impuesto', 'Clase', 'Base', '%', 'Valor'];
      const taxCols = [pageWidth - 80 - 90 - 50 - 80, 80, 90, 50, 80];
      y = drawHeader(taxHeaders, taxCols, y);
      nota.taxes.forEach((tax, idx) => {
        if (y > FOOTER_Y - 24) {
          doc.addPage();
          y = PAGE_MARGIN;
          y = drawHeader(taxHeaders, taxCols, y);
        }
        const values = [
          tax.taxCode || '—',
          tax.classCode || '—',
          `$${money(tax.base)}`,
          String(tax.vlrCalc ?? 0),
          `$${money(tax.vlrImpuesto)}`,
        ];
        let x = PAGE_MARGIN + 4;
        values.forEach((val, i) => {
          doc.font('Helvetica').fontSize(8).fillColor('#212121')
            .text(val, x, y + 4, { width: taxCols[i] - 6, align: i >= 2 ? 'right' : 'left' });
          x += taxCols[i];
        });
        y += 16;
      });
      y += 10;
    }

    const totals = [
      ['Base nota', nota.vlrNota],
      ...(nota.afectaIva ? [['IVA', nota.vlrIva]] : []),
      ...(nota.afectaImp ? [['Impuestos', nota.vlrImpuesto]] : []),
      ['NETO NOTA', nota.vlrNeto],
    ];
    const boxW = 230;
    const boxH = totals.length * 14 + 12;
    if (y + boxH > FOOTER_Y) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    const boxX = PAGE_MARGIN + pageWidth - boxW;
    doc.save();
    doc.roundedRect(boxX, y, boxW, boxH, 4).fill(brand.lightFill);
    doc.roundedRect(boxX, y, boxW, boxH, 4).lineWidth(0.8).strokeColor(brand.border).stroke();
    doc.restore();
    totals.forEach((row, i) => {
      const bold = i === totals.length - 1;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8)
        .fillColor(bold ? brand.primary : '#424242')
        .text(row[0], boxX + 10, y + 8 + i * 14, { width: 90 })
        .text(`$${money(row[1])}`, boxX + 100, y + 8 + i * 14, { width: boxW - 114, align: 'right' });
    });
    y += boxH + 16;

    const qrBoxH = cuds ? 100 : 78;
    if (y + qrBoxH > FOOTER_Y) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.save();
    doc.roundedRect(PAGE_MARGIN, y, pageWidth, qrBoxH, 4).fill(brand.lightFill);
    doc.roundedRect(PAGE_MARGIN, y, pageWidth, qrBoxH, 4).lineWidth(0.8).strokeColor(brand.border).stroke();
    doc.restore();
    if (qrBuffer) {
      doc.image(qrBuffer, PAGE_MARGIN + pageWidth - 130, y + 8, { width: 72, height: 72 });
      doc.font('Helvetica-Bold').fontSize(7).fillColor(brand.label)
        .text('Código QR', PAGE_MARGIN + pageWidth - 130, y + 82, { width: 72, align: 'center' });
    }
    doc.font('Helvetica-Bold').fontSize(8).fillColor(brand.label).text('CUDS', PAGE_MARGIN + 10, y + 10);
    if (cuds) {
      doc.font('Helvetica').fontSize(7).fillColor('#212121').text(cuds, PAGE_MARGIN + 10, y + 24, {
        width: pageWidth - 150,
      });
    } else {
      doc.font('Helvetica').fontSize(8).fillColor('#757575')
        .text('Disponible tras validación DIAN', PAGE_MARGIN + 10, y + 24);
    }
    if (fcxp.cude) {
      doc.font('Helvetica').fontSize(7).fillColor('#607d8b')
        .text(`CUDS documento soporte ${fcxp.cnsDocSoporte || ''}: ${fcxp.cude}`, PAGE_MARGIN + 10, y + (cuds ? 48 : 40), {
          width: pageWidth - 150,
        });
    }
    doc.font('Helvetica').fontSize(7).fillColor('#607d8b').text(
      'Representación gráfica de la nota de ajuste al documento soporte. La validez jurídica corresponde al XML firmado y a la respuesta de la DIAN.',
      PAGE_MARGIN + 10,
      y + (cuds ? 62 : 54),
      { width: pageWidth - 150 },
    );

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      const fy = FOOTER_Y;
      doc.save();
      doc.rect(PAGE_MARGIN, fy, pageWidth, STATUS_BAR_H).fill(brand.lightFill);
      doc.restore();
      doc.font('Helvetica').fontSize(7).fillColor('#212121');
      doc.text(`Impreso Por: ${userCode(printedBy) || '—'}`, PAGE_MARGIN + 6, fy + 5, { width: pageWidth / 3 });
      doc.text(`Fecha y Hora de Impresión: ${formatPrintDateTime(printedAt)}`, PAGE_MARGIN + pageWidth / 3, fy + 5, {
        width: pageWidth / 3,
        align: 'center',
      });
      doc.text(`Página ${i + 1} de ${range.count}`, PAGE_MARGIN + (pageWidth * 2) / 3, fy + 5, {
        width: pageWidth / 3 - 6,
        align: 'right',
      });
    }

    doc.end();
  });
}
