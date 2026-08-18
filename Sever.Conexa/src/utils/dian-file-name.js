/** Nomenclatura DIAN anexo técnico — adnnnnnnnnnnpppaadddddddd.xml */

export function padDianNit(nit) {
  const digits = String(nit || '').replace(/\D/g, '');
  return digits.slice(-10).padStart(10, '0');
}

export function normalizeAssignmentCode(code) {
  return String(code || '000').replace(/\D/g, '').padStart(3, '0').slice(-3);
}

/**
 * @param {{ nit: string, assignmentCode?: string, year?: number, sequence: number }} params
 */
export function buildDianAttachedDocumentFileName({
  nit,
  assignmentCode = '000',
  year,
  sequence,
}) {
  const paddedNit = padDianNit(nit);
  const ppp = normalizeAssignmentCode(assignmentCode);
  const yy = String(year ?? new Date().getFullYear()).slice(-2);
  const seq = Number(sequence);
  if (!Number.isFinite(seq) || seq < 1 || seq > 0xFFFFFFFF) {
    throw new Error('Consecutivo DIAN inválido para AttachedDocument');
  }
  const hexSeq = seq.toString(16).toUpperCase().padStart(8, '0');
  return `ad${paddedNit}${ppp}${yy}${hexSeq}.xml`;
}

/** z + mismo cuerpo que ad...xml (estándar DIAN para envío al adquiriente). */
export function zipFileNameFromAttached(adFileName) {
  if (!adFileName) return null;
  const base = String(adFileName).replace(/\.xml$/i, '');
  if (/^ad[0-9A-F]{20,}$/i.test(base)) {
    return `z${base.slice(2)}.zip`;
  }
  return null;
}

export function buildClientEmailSubject({ companyNit, companyName, invoiceNumber, documentType = '01' }) {
  const nit = padDianNit(companyNit);
  const name = String(companyName || '').trim().slice(0, 80);
  const number = String(invoiceNumber || '').trim();
  return `${nit};${name};${number};${documentType};${name}`;
}

/** ad + mismo cuerpo que un ZIP z... (estándar DIAN). */
export function attachedDocumentFileNameFromZip(zipFileName) {
  if (!zipFileName) return null;
  const base = String(zipFileName).replace(/\.(zip|xml)$/i, '');
  if (/^z[0-9A-F]{20,}$/i.test(base)) {
    return `ad${base.slice(1)}.xml`;
  }
  return null;
}

export async function nextDianFileSequence(pool, companyId, docKind, year) {
  const { rows } = await pool.query(
    `INSERT INTO dian_file_sequences (company_id, doc_kind, year, last_value)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (company_id, doc_kind, year)
     DO UPDATE SET last_value = dian_file_sequences.last_value + 1, updated_at = NOW()
     RETURNING last_value`,
    [companyId, docKind, year]
  );
  return rows[0].last_value;
}
