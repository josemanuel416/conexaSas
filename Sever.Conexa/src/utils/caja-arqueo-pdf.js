import PDFDocument from 'pdfkit';
import { formatDateTimeEs } from './app-timezone.js';

const PAGE_MARGIN = 40;
const FOOTER_Y = 740;

function money(value) {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  return formatDateTimeEs(value, { dateStyle: 'short', timeStyle: 'short' });
}

function statusLabel(status) {
  const map = {
    borrador: 'Borrador',
    confirmado: 'Confirmado',
    anulado: 'Anulado',
    descartado: 'Descartado',
  };
  return map[status] || status || '—';
}

function ensureSpace(doc, y, needed = 40) {
  if (y + needed > FOOTER_Y) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

export function buildCajaArqueoPdfFileName(session) {
  const num = session.sessionNumber || session.session_number || 'sesion';
  return `Arqueo-${num}.pdf`;
}

export function buildCajaArqueoPdf({ company, session, receipts = [], paymentBalances = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - PAGE_MARGIN * 2;
    let y = PAGE_MARGIN;

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#00796B')
      .text(company.name || '—', PAGE_MARGIN, y, { width: pageWidth, align: 'center' });
    y += 18;
    if (company.nit) {
      doc.font('Helvetica').fontSize(9).fillColor('#616161')
        .text(`NIT ${company.nit}`, PAGE_MARGIN, y, { width: pageWidth, align: 'center' });
      y += 14;
    }

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#212121')
      .text('ARQUEO DE CAJA', PAGE_MARGIN, y, { width: pageWidth, align: 'center' });
    y += 22;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#212121')
      .text(`${session.sessionNumber} — ${session.registerName || session.register_name || 'Caja'}`, PAGE_MARGIN, y);
    y += 16;

    doc.font('Helvetica').fontSize(9).fillColor('#424242');
    const meta = [
      `Apertura: ${formatDateTime(session.openedAt || session.opened_at)}${session.openedByName || session.opened_by_name ? ` · ${session.openedByName || session.opened_by_name}` : ''}`,
      session.closedAt || session.closed_at
        ? `Cierre: ${formatDateTime(session.closedAt || session.closed_at)}${session.closedByName || session.closed_by_name ? ` · ${session.closedByName || session.closed_by_name}` : ''}`
        : 'Estado: Sesión abierta',
    ];
    for (const line of meta) {
      doc.text(line, PAGE_MARGIN, y, { width: pageWidth });
      y += 12;
    }
    y += 8;

    const summary = [
      ['Saldo inicial', money(session.openingAmount ?? session.opening_amount)],
      ['Ingresos', money(session.totalIngress ?? session.total_ingress)],
      ['Egresos', money(session.totalEgress ?? session.total_egress)],
    ];
    if (session.expectedBalance != null || session.expected_balance != null) {
      summary.push(['Saldo esperado', money(session.expectedBalance ?? session.expected_balance)]);
    }
    if (session.countedBalance != null || session.counted_balance != null) {
      summary.push(['Saldo contado', money(session.countedBalance ?? session.counted_balance)]);
    }
    if (session.balanceDifference != null || session.balance_difference != null) {
      summary.push(['Diferencia', money(session.balanceDifference ?? session.balance_difference)]);
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#00796B').text('Resumen', PAGE_MARGIN, y);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#212121');
    for (const [label, value] of summary) {
      doc.text(`${label}:`, PAGE_MARGIN, y, { continued: true, width: 140 });
      doc.text(`$${value}`, { align: 'right', width: pageWidth - 140 });
      y += 13;
    }

    if (session.closedWithBalance || session.closed_with_balance) {
      y += 4;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#E65100')
        .text(`Cierre con saldo pendiente: $${money(session.carriedBalance ?? session.carried_balance)}`, PAGE_MARGIN, y);
      y += 14;
    } else {
      y += 6;
    }

    if (paymentBalances.length) {
      y = ensureSpace(doc, y, 80);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#00796B')
        .text('Arqueo por forma de pago', PAGE_MARGIN, y);
      y += 14;

      const cols = [120, 100, 100, 100];
      const headers = ['Forma', 'Esperado', 'Contado', 'Diferencia'];
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      doc.rect(PAGE_MARGIN, y, pageWidth, 16).fill('#00796B');
      let x = PAGE_MARGIN + 4;
      headers.forEach((h, i) => {
        doc.text(h, x, y + 4, { width: cols[i] - 8 });
        x += cols[i];
      });
      y += 18;

      doc.font('Helvetica').fontSize(8).fillColor('#212121');
      for (const row of paymentBalances) {
        y = ensureSpace(doc, y, 18);
        x = PAGE_MARGIN + 4;
        const cells = [
          row.paymentMethodLabel || row.payment_method || '—',
          `$${money(row.expectedAmount ?? row.expected_amount)}`,
          `$${money(row.countedAmount ?? row.counted_amount)}`,
          `$${money(row.difference)}`,
        ];
        cells.forEach((cell, i) => {
          doc.text(cell, x, y, { width: cols[i] - 8 });
          x += cols[i];
        });
        y += 14;
      }
      y += 8;
    }

    y = ensureSpace(doc, y, 60);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#00796B')
      .text(`Recibos y movimientos (${receipts.length})`, PAGE_MARGIN, y);
    y += 14;

    const rCols = [70, 180, 70, 55, 75];
    const rHeaders = ['Recibo', 'Concepto', 'Estado', 'Forma', 'Valor'];
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    doc.rect(PAGE_MARGIN, y, pageWidth, 16).fill('#455A64');
    let rx = PAGE_MARGIN + 4;
    rHeaders.forEach((h, i) => {
      doc.text(h, rx, y + 4, { width: rCols[i] - 8 });
      rx += rCols[i];
    });
    y += 18;

    doc.font('Helvetica').fontSize(7.5).fillColor('#212121');
    for (const r of receipts) {
      y = ensureSpace(doc, y, 20);
      const sign = r.movementType === 'egreso' || r.movement_type === 'egreso' ? '-' : '+';
      const cells = [
        r.receiptNumber || r.receipt_number || '—',
        (r.concept || '—').slice(0, 42),
        statusLabel(r.status),
        r.paymentMethodLabel || r.payment_method || '—',
        `${sign}$${money(r.amount)}`,
      ];
      rx = PAGE_MARGIN + 4;
      cells.forEach((cell, i) => {
        doc.text(cell, rx, y, { width: rCols[i] - 8 });
        rx += rCols[i];
      });
      y += 13;
      if (r.invoiceFullNumber || r.invoice_full_number) {
        doc.font('Helvetica-Oblique').fontSize(7).fillColor('#757575')
          .text(`Factura ${r.invoiceFullNumber || r.invoice_full_number}`, PAGE_MARGIN + 74, y);
        y += 10;
        doc.font('Helvetica').fontSize(7.5).fillColor('#212121');
      }
    }

    if (session.closingNotes || session.closing_notes) {
      y = ensureSpace(doc, y, 40);
      y += 8;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#424242').text('Notas de cierre', PAGE_MARGIN, y);
      y += 12;
      doc.font('Helvetica').fontSize(8).fillColor('#616161')
        .text(session.closingNotes || session.closing_notes, PAGE_MARGIN, y, { width: pageWidth });
    }

    const generated = formatDateTimeEs(new Date());
    doc.font('Helvetica').fontSize(7).fillColor('#9E9E9E')
      .text(`Generado ${generated} — Documento interno de arqueo de caja`, PAGE_MARGIN, FOOTER_Y, {
        width: pageWidth,
        align: 'center',
      });

    doc.end();
  });
}
