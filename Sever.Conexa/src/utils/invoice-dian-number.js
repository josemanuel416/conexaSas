/** Utilidades de numeración DIAN en facturas y referencias de NC. */

export function buildFullNumber(prefix, consecutive) {
  return `${prefix}${String(consecutive).padStart(8, '0')}`;
}

export function parseDianFullNumber(fullNumber) {
  const value = String(fullNumber || '').trim();
  if (!value) return null;
  const match = value.match(/^([A-Z]{1,10})(\d+)$/i);
  if (!match) return null;
  return {
    prefix: match[1].toUpperCase(),
    consecutive: Number(match[2]),
    fullNumber: `${match[1].toUpperCase()}${match[2]}`,
  };
}

export function resolveInvoiceDianNumber(invoice) {
  if (!invoice) return null;

  const prefix = invoice.prefix || invoice.sourceInvoicePrefix || null;
  const consecutiveRaw = invoice.consecutiveNumber ?? invoice.consecutive_number
    ?? invoice.sourceInvoiceConsecutive ?? invoice.source_invoice_consecutive ?? null;
  const consecutive = consecutiveRaw != null ? Number(consecutiveRaw) : null;
  const fullNumber = invoice.fullNumber || invoice.full_number
    || invoice.sourceInvoiceFullNumber || invoice.source_invoice_full_number || null;

  if (prefix && consecutive != null && Number.isFinite(consecutive)) {
    return {
      prefix: String(prefix).toUpperCase(),
      consecutive,
      fullNumber: fullNumber || buildFullNumber(prefix, consecutive),
    };
  }

  if (fullNumber) {
    const parsed = parseDianFullNumber(fullNumber);
    if (parsed) return parsed;
    return { prefix: null, consecutive: null, fullNumber };
  }

  return null;
}

export function resolveCreditNoteSourceReference(creditNote, sourceInvoice) {
  const fromCreditNote = resolveInvoiceDianNumber({
    prefix: creditNote?.sourceInvoicePrefix,
    consecutiveNumber: creditNote?.sourceInvoiceConsecutive,
    fullNumber: creditNote?.sourceInvoiceFullNumber,
  });
  if (fromCreditNote?.fullNumber) return fromCreditNote;

  const fromSource = resolveInvoiceDianNumber(sourceInvoice);
  if (fromSource?.fullNumber) return fromSource;

  return null;
}

export function assertSourceInvoiceDianNumber(sourceInvoice) {
  const dian = resolveInvoiceDianNumber(sourceInvoice);
  if (!dian?.prefix || dian.consecutive == null || !dian.fullNumber) {
    throw Object.assign(
      new Error(
        'La factura origen no tiene prefijo y consecutivo DIAN guardados. '
        + 'Solo se pueden acreditar facturas electrónicas numeradas con resolución.'
      ),
      { status: 400 }
    );
  }
  return dian;
}
