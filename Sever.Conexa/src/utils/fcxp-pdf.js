import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { resolveCompanyLogoAbsolute } from './company-logo.js';
import { CONEXASOFT_INVOICE_BRAND } from '../config/conexasoft-brand.js';
import { formatDateEs as formatDate, formatPrintDateTime } from './app-timezone.js';

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

function padCxp(cns) {
  const n = Number(cns);
  if (!n) return '—';
  return `CXP-${String(n).padStart(6, '0')}`;
}

function userCode(user) {
  const email = String(user?.email || '').trim();
  if (email.includes('@')) return email.split('@')[0];
  return email || String(user?.fullName || user?.full_name || '').trim();
}

export function extractDsSignedMeta(signedXml) {
  if (!signedXml) return {};
  const qrText = signedXml.match(/<sts:QRCode>([\s\S]*?)<\/sts:QRCode>/i)?.[1]?.trim() || '';
  const cuds = signedXml.match(/<cbc:UUID[^>]*schemeName="CUDS-SHA384"[^>]*>([^<]+)<\/cbc:UUID>/i)?.[1]?.trim()
    || signedXml.match(/<cbc:UUID[^>]*schemeName="CUDE-SHA384"[^>]*>([^<]+)<\/cbc:UUID>/i)?.[1]?.trim()
    || signedXml.match(/<cbc:UUID[^>]*>([^<]+)<\/cbc:UUID>/i)?.[1]?.trim();
  return { qrText, cuds };
}

export function buildDsQrPayload({ fcxp, signedMeta, dianEnvironment, cudsOverride = '' }) {
  if (signedMeta.qrText?.startsWith('http')) return signedMeta.qrText;
  const cuds = signedMeta.cuds || cudsOverride || fcxp.cude || '';
  if (cuds && dianEnvironment === 'produccion') {
    return `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cuds}`;
  }
  if (signedMeta.qrText) return signedMeta.qrText;
  if (cuds) {
    return `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${cuds}`;
  }
  return '';
}

export function buildFcxpPdfFileName(fcxp) {
  return `CxP-${padCxp(fcxp.cnsFcxp)}.pdf`;
}

export async function buildFcxpPdf({
  company,
  fcxp,
  printedBy = null,
  signedXml = null,
  dianEnvironment = '',
}) {
  const signedMeta = extractDsSignedMeta(signedXml);
  const cuds = signedMeta.cuds || fcxp.cude || '';
  const qrPayload = buildDsQrPayload({ fcxp, signedMeta, dianEnvironment });
  const qrBuffer = qrPayload
    ? await QRCode.toBuffer(qrPayload, { margin: 1, width: 140 })
    : null;

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
    doc.rect(PAGE_MARGIN, y, pageWidth, 36).fill(brand.secondary);
    doc.fillColor(brand.accent).font('Helvetica-Bold').fontSize(12)
      .text('CUENTA POR PAGAR', PAGE_MARGIN + 12, y + 11, { width: pageWidth - 24, align: 'center' });
    doc.restore();
    y += 36;
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
      { label: 'NÚMERO', value: padCxp(fcxp.cnsFcxp) },
      { label: 'FECHA', value: formatDate(fcxp.fechaCxp) },
      { label: 'TERCERO', value: fcxp.terceroNombre || '—' },
      { label: 'DOCUMENTO', value: fcxp.terceroDocumento || '—' },
      { label: 'FACTURA PROVEEDOR', value: fcxp.nroFactura || '—' },
      { label: 'VENCIMIENTO', value: formatDate(fcxp.fechaVence) },
    ];
    const cardH = 78;
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

    const lineHeaders = ['#', 'Descripción', 'Cant.', 'Valor', 'IVA', 'Neto'];
    const lineCols = [28, pageWidth - 28 - 52 - 70 - 70 - 70, 52, 70, 70, 70];
    y = drawHeader(lineHeaders, lineCols, y);
    (fcxp.details || []).forEach((line, idx) => {
      if (y > FOOTER_Y - 24) {
        doc.addPage();
        y = PAGE_MARGIN;
        y = drawHeader(lineHeaders, lineCols, y);
      }
      const values = [
        String(line.item ?? idx + 1),
        line.descripcion || line.serviceDescription || '—',
        String(line.cantidad ?? 1),
        `$${money(line.valor)}`,
        `$${money(line.vlrIva)}`,
        `$${money(line.vlrNeto)}`,
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

    if ((fcxp.taxes || []).length) {
      const taxHeaders = ['Impuesto', 'Clase', 'Base', '%', 'Valor'];
      const taxCols = [pageWidth - 80 - 90 - 50 - 80, 80, 90, 50, 80];
      y = drawHeader(taxHeaders, taxCols, y);
      fcxp.taxes.forEach((tax, idx) => {
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
      ['Bruto', fcxp.vlrBruto],
      ['IVA', fcxp.vlrIva],
      ['Impuestos', fcxp.vlrImpuestos],
      ['Notas crédito', fcxp.vlrNotaCr],
      ['Notas débito', fcxp.vlrNotaDb],
      ['Abonos', fcxp.vlrAbonos],
      ['NETO', fcxp.valorNeto],
      ['SALDO', fcxp.saldo],
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
      const bold = i >= totals.length - 2;
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
    if (fcxp.cnsDocSoporte) {
      doc.font('Helvetica').fontSize(7).fillColor('#607d8b')
        .text(`Documento soporte ${fcxp.cnsDocSoporte}`, PAGE_MARGIN + 10, y + (cuds ? 48 : 40), {
          width: pageWidth - 150,
        });
    }
    doc.font('Helvetica').fontSize(7).fillColor('#607d8b').text(
      'Representación gráfica del documento soporte. La validez jurídica corresponde al XML firmado y a la respuesta de la DIAN.',
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
