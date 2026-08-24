import fs from 'fs';
import path from 'path';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { formatClient } from './client-format.js';
import { buildSupportAdjustmentNoteUbl } from './ubl-support-adjustment-note.js';
import { buildAdjustmentNoteConceptUbl } from './dian-adjustment-note-concepts.js';
import { pingFePos, sendInvoiceToFePos } from './fepos-client.js';
import { assessDianReadiness, formatCompanyDian } from './dian-readiness.js';
import {
  assessCertificateReadiness,
  assessFePosSendReadiness,
  formatCertificateInfo,
  resolveSecret,
  syncFePosCompanyMeta,
} from './dian-certificate.js';
import { usesDianTestSet } from './dian-environment.js';
import { extractDianValidationErrors, formatDianResponseForDisplay } from './dian-response.js';
import { assertActiveCndbcrForNota } from './cndbcr.js';

export const NOTA_ACTIVE_STATUSES = ['confirmada', 'enviada_dian', 'aprobada_dian', 'rechazada_dian'];

export function calcSaldoFromNotas({ valorNeto, vlrNotaDb, vlrNotaCr, vlrAbonos }) {
  return Math.round(
    (Number(valorNeto) - Number(vlrNotaDb) + Number(vlrNotaCr) - Number(vlrAbonos)) * 100,
  ) / 100;
}

export function formatNotaDetail(d) {
  return {
    id: d.id,
    fcxpdId: d.fcxpd_id,
    fcxpdItem: d.fcxpd_item,
    descripcion: d.descripcion,
    vlrAfecta: Number(d.vlr_afecta),
    vlrIva: Number(d.vlr_iva),
  };
}

export function formatNotaTax(t) {
  return {
    id: t.id,
    cnsFcxpdbcri: t.cns_fcxpdbcri,
    fcxpiId: t.fcxpi_id,
    idImpuesto: t.id_impuesto,
    idClase: t.id_clase,
    taxCode: t.tax_code,
    classCode: t.class_code,
    vlrCalc: Number(t.vlr_calc),
    base: Number(t.base),
    vlrImpuesto: Number(t.vlr_impuesto),
  };
}

export function formatNota(row, details = [], taxes = []) {
  return {
    id: row.id,
    fcxpId: row.fcxp_id,
    item: row.item,
    tipoNota: row.tipo_nota,
    vlrNota: Number(row.vlr_nota),
    afectaImp: row.afecta_imp,
    vlrImpuesto: Number(row.vlr_impuesto),
    afectaIva: row.afecta_iva,
    vlrIva: Number(row.vlr_iva),
    vlrNeto: Number(row.vlr_neto),
    mdetalle: row.mdetalle,
    detalle: row.detalle,
    cndbcrId: row.cndbcr_id,
    concepto: row.concepto || null,
    conceptoDescripcion: row.concepto_descripcion || null,
    dianCode: row.dian_code || null,
    cuentaConta: row.cuenta_conta || null,
    cuentaContaCode: row.cuenta_conta_code || null,
    fechaNota: row.fecha_nota,
    status: row.status,
    cnsDocAjuste: row.cns_doc_ajuste,
    cnsResol: row.cns_resol,
    cude: row.cude,
    estDian: row.est_dian,
    issueDate: row.issue_date,
    issueTime: row.issue_time ? String(row.issue_time).slice(0, 8) : null,
    details: details.map(formatNotaDetail),
    taxes: taxes.map(formatNotaTax),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatNotaSubmission(s) {
  return {
    id: s.id,
    attemptNumber: s.attempt_number,
    dianEnvironment: s.dian_environment,
    zipFileName: s.zip_file_name,
    status: s.status,
    statusCode: s.status_code,
    statusMessage: s.status_message,
    trackId: s.track_id,
    uuid: s.uuid,
    isSuccess: s.is_success,
    sentAt: s.sent_at,
    respondedAt: s.responded_at,
    createdAt: s.created_at,
    hasRequestXml: Boolean(s.request_xml),
    hasSignedXml: Boolean(s.signed_xml),
    hasResponseXml: Boolean(s.response_xml),
  };
}

function formatResolution(r) {
  return {
    id: r.id,
    resolutionNumber: r.resolution_number,
    prefix: r.prefix,
    rangeFrom: Number(r.range_from),
    rangeTo: Number(r.range_to),
    currentConsecutive: Number(r.current_consecutive),
    resolutionDate: r.resolution_date,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    technicalKey: r.technical_key,
    documentType: r.document_type,
    documentProcess: r.document_process || 'FV',
    dianEnvironment: r.dian_environment,
    isActive: r.is_active,
    notes: r.notes,
  };
}

function isFePosSubmissionPending(fePosResult) {
  if (fePosResult?.pendiente) return true;
  const msg = String(fePosResult?.mensaje || '').toLowerCase();
  return fePosResult?.codigo === '999' && msg.includes('proceso');
}

function resolveSubmissionFromFePos(fePosResult) {
  const approved = Boolean(fePosResult?.aprobada);
  const pending = !approved && isFePosSubmissionPending(fePosResult);
  const statusCode = fePosResult?.codigo || (approved ? '00' : pending ? '999' : '99');
  const statusMessage = fePosResult?.mensaje
    || (approved ? 'Aprobada por DIAN' : pending ? 'En validación por DIAN' : 'Rechazada por DIAN');
  const submissionStatus = approved ? 'aprobado' : pending ? 'enviado' : 'rechazado';
  const notaStatus = approved ? 'aprobada_dian' : pending ? 'enviada_dian' : 'rechazada_dian';
  return { approved, pending, statusCode, statusMessage, submissionStatus, notaStatus };
}

export async function loadNota(notaId, companyId) {
  const { rows } = await pool.query(
    `SELECT n.*,
            c.concepto,
            c.descripcion AS concepto_descripcion,
            c.dian_code,
            c.cuenta_conta,
            aa.code AS cuenta_conta_code
     FROM fcxpdbcr n
     LEFT JOIN cndbcr c ON c.id = n.cndbcr_id
     LEFT JOIN accounting_accounts aa ON aa.id = c.cuenta_conta
     WHERE n.id = $1 AND n.company_id = $2`,
    [notaId, companyId],
  );
  if (!rows[0]) return null;

  const { rows: detailRows } = await pool.query(
    `SELECT nd.*, d.item AS fcxpd_item, d.descripcion
     FROM fcxpdbcrd nd
     JOIN fcxpd d ON d.id = nd.fcxpd_id
     WHERE nd.fcxpdbcr_id = $1 ORDER BY d.item`,
    [notaId],
  );
  const { rows: taxRows } = await pool.query(
    `SELECT t.*, at.code AS tax_code, tc.class_code
     FROM fcxpdbcri t
     LEFT JOIN accounting_taxes at ON at.id = t.id_impuesto
     LEFT JOIN accounting_tax_classes tc ON tc.id = t.id_clase
     WHERE t.fcxpdbcr_id = $1 ORDER BY t.cns_fcxpdbcri`,
    [notaId],
  );
  return formatNota(rows[0], detailRows, taxRows);
}

export async function loadNotasForFcxp(fcxpId, companyId) {
  const { rows } = await pool.query(
    `SELECT * FROM fcxpdbcr WHERE fcxp_id = $1 AND company_id = $2 ORDER BY item`,
    [fcxpId, companyId],
  );
  const result = [];
  for (const row of rows) {
    result.push(await loadNota(row.id, companyId));
  }
  return result;
}

async function nextNotaItem(client, fcxpId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(item), 0) + 1 AS next FROM fcxpdbcr WHERE fcxp_id = $1`,
    [fcxpId],
  );
  return Number(rows[0].next);
}

export async function lockNas95Resolution(client, companyId) {
  const { rows } = await client.query(
    `SELECT * FROM dian_resolutions
     WHERE company_id = $1 AND document_process = 'DS' AND document_type = '95' AND is_active = true
     FOR UPDATE`,
    [companyId],
  );
  return rows[0] || null;
}

/** Usa la resolución DS de la CxP origen (tipo 05 o 95); si no hay, busca NAS 95 activa. */
export async function lockNasResolutionForFcxp(client, companyId, fcxpCnsResol) {
  if (fcxpCnsResol) {
    const { rows } = await client.query(
      `SELECT * FROM dian_resolutions
       WHERE id = $1 AND company_id = $2 AND document_process = 'DS'
         AND document_type IN ('05', '95') AND is_active = true
       FOR UPDATE`,
      [fcxpCnsResol, companyId],
    );
    if (rows[0]) return rows[0];
  }
  return lockNas95Resolution(client, companyId);
}

export async function assignNas95Number(client, resolution) {
  const next = Number(resolution.current_consecutive) + 1;
  if (next > Number(resolution.range_to)) {
    throw Object.assign(new Error('Rango de numeración NAS (95) agotado'), { status: 400 });
  }
  await client.query(
    `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
    [next, resolution.id],
  );
  const fullNumber = `${resolution.prefix}${String(next).padStart(8, '0')}`;
  return { consecutive: next, fullNumber, resolutionId: resolution.id };
}

export async function getLineDisponibilidad(client, fcxpId, companyId, excludeNotaId = null) {
  const values = [fcxpId, companyId, NOTA_ACTIVE_STATUSES];
  let excludeSql = '';
  if (excludeNotaId) {
    values.push(excludeNotaId);
    excludeSql = `AND n.id <> $${values.length}`;
  }
  const { rows } = await client.query(
    `SELECT d.id, d.item, d.descripcion, d.valor, d.cantidad, d.vlr_descuento, d.vlr_iva, d.vlr_neto,
            GREATEST(0, (d.valor * d.cantidad - d.vlr_descuento) - COALESCE((
              SELECT SUM(nd.vlr_afecta)
              FROM fcxpdbcrd nd
              JOIN fcxpdbcr n ON n.id = nd.fcxpdbcr_id
              WHERE nd.fcxpd_id = d.id
                AND n.status = ANY($3::fcxp_nota_status[])
                ${excludeSql}
            ), 0)) AS disponible,
            CASE WHEN GREATEST(0, (d.valor * d.cantidad - d.vlr_descuento)) > 0
              THEN ROUND((d.vlr_iva / GREATEST(0.01, d.valor * d.cantidad - d.vlr_descuento)) * 10000) / 100
              ELSE 0 END AS iva_pct
     FROM fcxpd d
     WHERE d.fcxp_id = $1 AND d.company_id = $2
     ORDER BY d.item`,
    values,
  );
  return rows.map((r) => ({
    fcxpdId: r.id,
    item: r.item,
    descripcion: r.descripcion,
    vlrNeto: Number(r.vlr_neto),
    disponible: Number(r.disponible),
    ivaPct: Number(r.iva_pct),
  }));
}

export async function getTaxDisponibilidad(client, fcxpId, companyId, excludeNotaId = null) {
  const values = [fcxpId, companyId, NOTA_ACTIVE_STATUSES];
  let excludeSql = '';
  if (excludeNotaId) {
    values.push(excludeNotaId);
    excludeSql = `AND n.id <> $${values.length}`;
  }
  const { rows } = await client.query(
    `SELECT t.id, t.cns_fcxpi, t.id_impuesto, t.id_clase, t.vlr_calc, t.base, t.vlr_impuesto,
            at.code AS tax_code, tc.class_code,
            GREATEST(0, t.vlr_impuesto - COALESCE((
              SELECT SUM(ni.vlr_impuesto)
              FROM fcxpdbcri ni
              JOIN fcxpdbcr n ON n.id = ni.fcxpdbcr_id
              WHERE ni.fcxpi_id = t.id
                AND n.status = ANY($3::fcxp_nota_status[])
                ${excludeSql}
            ), 0)) AS disponible
     FROM fcxpi t
     LEFT JOIN accounting_taxes at ON at.id = t.id_impuesto
     LEFT JOIN accounting_tax_classes tc ON tc.id = t.id_clase
     WHERE t.fcxp_id = $1 AND t.company_id = $2
     ORDER BY t.cns_fcxpi`,
    values,
  );
  return rows.map((r) => ({
    fcxpiId: r.id,
    cnsFcxpi: r.cns_fcxpi,
    idImpuesto: r.id_impuesto,
    idClase: r.id_clase,
    taxCode: r.tax_code,
    classCode: r.class_code,
    vlrCalc: Number(r.vlr_calc),
    base: Number(r.base),
    vlrImpuesto: Number(r.vlr_impuesto),
    disponible: Number(r.disponible),
  }));
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function computeLineIva(vlrAfecta, ivaPct) {
  return round2((Number(vlrAfecta) * Number(ivaPct)) / 100);
}

function computeEffectiveIvaPct(lineDisponibles) {
  const lines = lineDisponibles.filter((l) => Number(l.ivaPct) > 0);
  if (!lines.length) return 0;
  const totalWeight = lines.reduce((s, l) => s + Number(l.disponible || 0), 0);
  if (totalWeight <= 0) {
    return round2(lines.reduce((s, l) => s + Number(l.ivaPct), 0) / lines.length);
  }
  return round2(lines.reduce((s, l) => s + Number(l.disponible) * Number(l.ivaPct), 0) / totalWeight);
}

function computeAutoTaxAmount(vlrNota, taxInfo) {
  const disponible = Number(taxInfo.disponible) || 0;
  if (disponible <= 0) return 0;
  const rate = Number(taxInfo.vlrCalc) || 0;
  const calculated = rate > 0 && vlrNota > 0 ? round2(vlrNota * rate / 100) : 0;
  return Math.min(calculated, disponible);
}

export function normalizeNotaPayload(body, { lineDisponibles = [], taxDisponibles = [] } = {}) {
  const tipoNota = String(body.tipoNota || '').toUpperCase();
  if (!['DB', 'CR'].includes(tipoNota)) {
    throw Object.assign(new Error('tipoNota debe ser DB o CR'), { status: 400 });
  }
  const mdetalle = Boolean(body.mdetalle);
  const afectaIva = Boolean(body.afectaIva);
  const afectaImp = Boolean(body.afectaImp);
  const cndbcrId = body.cndbcrId || body.cndbcr_id || null;
  const detalle = body.detalle || null;
  const fechaNota = body.fechaNota || new Date().toISOString().slice(0, 10);

  if (!cndbcrId) {
    throw Object.assign(new Error('Seleccione el concepto de la nota'), { status: 400 });
  }

  if (afectaIva && !lineDisponibles.some((l) => Number(l.ivaPct) > 0)) {
    throw Object.assign(new Error('La CxP no tiene IVA para afectar en la nota'), { status: 400 });
  }
  if (afectaImp && !taxDisponibles.some((t) => Number(t.disponible) > 0)) {
    throw Object.assign(new Error('La CxP no tiene retenciones para afectar en la nota'), { status: 400 });
  }

  let vlrNota = 0;
  let vlrIva = 0;
  let vlrImpuesto = 0;
  const details = [];
  const taxes = [];

  if (mdetalle) {
    const inputDetails = Array.isArray(body.details) ? body.details : [];
    if (!inputDetails.length) {
      throw Object.assign(new Error('Agregue al menos una línea cuando mdetalle está activo'), { status: 400 });
    }
    for (const d of inputDetails) {
      const fcxpdId = d.fcxpdId;
      const lineInfo = lineDisponibles.find((l) => l.fcxpdId === fcxpdId);
      if (!lineInfo) {
        throw Object.assign(new Error(`Línea ${fcxpdId || '?'} no encontrada en la CxP`), { status: 400 });
      }
      const vlrAfecta = round2(d.vlrAfecta);
      if (vlrAfecta <= 0) {
        throw Object.assign(new Error(`Monto inválido en línea ${lineInfo.item}`), { status: 400 });
      }
      if (vlrAfecta > lineInfo.disponible + 0.001) {
        throw Object.assign(
          new Error(`Línea ${lineInfo.item}: máximo disponible ${lineInfo.disponible}`),
          { status: 400 },
        );
      }
      const lineIva = afectaIva ? computeLineIva(vlrAfecta, lineInfo.ivaPct) : 0;
      details.push({ fcxpdId, vlrAfecta, vlrIva: lineIva });
      vlrNota += vlrAfecta;
      vlrIva += lineIva;
    }
    vlrNota = round2(vlrNota);
    vlrIva = round2(vlrIva);
  } else {
    vlrNota = round2(body.vlrNota);
    if (vlrNota <= 0) {
      throw Object.assign(new Error('vlrNota debe ser mayor a cero'), { status: 400 });
    }
    if (body.details?.length) {
      throw Object.assign(new Error('No envíe líneas cuando mdetalle está desactivado'), { status: 400 });
    }
    vlrIva = afectaIva ? round2(vlrNota * computeEffectiveIvaPct(lineDisponibles) / 100) : 0;
  }

  if (afectaImp) {
    const inputTaxes = Array.isArray(body.taxes) ? body.taxes : [];
    const taxSource = inputTaxes.length
      ? inputTaxes
      : taxDisponibles.filter((t) => Number(t.disponible) > 0).map((t) => ({ fcxpiId: t.fcxpiId }));
    if (!taxSource.length) {
      throw Object.assign(new Error('Agregue impuestos cuando afecta_imp está activo'), { status: 400 });
    }
    for (const t of taxSource) {
      const taxInfo = taxDisponibles.find((x) => x.fcxpiId === t.fcxpiId);
      if (!taxInfo) {
        throw Object.assign(new Error('Impuesto origen no encontrado'), { status: 400 });
      }
      const vlrImp = round2(t.vlrImpuesto ?? computeAutoTaxAmount(vlrNota, taxInfo));
      const base = round2(t.base ?? vlrNota);
      if (vlrImp <= 0) {
        throw Object.assign(new Error(`Valor inválido en impuesto ${taxInfo.taxCode || ''}`), { status: 400 });
      }
      if (vlrImp > taxInfo.disponible + 0.001) {
        throw Object.assign(
          new Error(`Impuesto ${taxInfo.taxCode}: máximo disponible ${taxInfo.disponible}`),
          { status: 400 },
        );
      }
      taxes.push({
        fcxpiId: taxInfo.fcxpiId,
        idImpuesto: taxInfo.idImpuesto,
        idClase: taxInfo.idClase,
        vlrCalc: t.vlrCalc ?? taxInfo.vlrCalc,
        base,
        vlrImpuesto: vlrImp,
      });
      vlrImpuesto += vlrImp;
    }
    vlrImpuesto = round2(vlrImpuesto);
  } else if (body.taxes?.length) {
    throw Object.assign(new Error('No envíe impuestos si afecta_imp está desactivado'), { status: 400 });
  }

  const vlrNeto = round2(vlrNota + (afectaIva ? vlrIva : 0) + (afectaImp ? vlrImpuesto : 0));
  const expectedNeto = round2(
    Number(body.vlrNeto ?? vlrNeto),
  );
  if (Math.abs(expectedNeto - vlrNeto) > 0.02) {
    throw Object.assign(new Error(`vlrNeto inconsistente (esperado ${vlrNeto})`), { status: 400 });
  }

  return {
    tipoNota,
    mdetalle,
    afectaIva,
    afectaImp,
    cndbcrId,
    detalle,
    fechaNota,
    vlrNota,
    vlrIva,
    vlrImpuesto,
    vlrNeto,
    details,
    taxes,
  };
}

export async function recalcFcxpNotaTotals(client, fcxpId, companyId) {
  const { rows: fcxpRows } = await client.query(
    `SELECT valor_neto, vlr_abonos FROM fcxp WHERE id = $1 AND company_id = $2 FOR UPDATE`,
    [fcxpId, companyId],
  );
  if (!fcxpRows[0]) return null;

  const { rows: totals } = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo_nota = 'DB' THEN vlr_neto ELSE 0 END), 0) AS vlr_nota_db,
       COALESCE(SUM(CASE WHEN tipo_nota = 'CR' THEN vlr_neto ELSE 0 END), 0) AS vlr_nota_cr
     FROM fcxpdbcr
     WHERE fcxp_id = $1 AND company_id = $2
       AND status = ANY($3::fcxp_nota_status[])`,
    [fcxpId, companyId, NOTA_ACTIVE_STATUSES],
  );

  const vlrNotaDb = round2(totals[0].vlr_nota_db);
  const vlrNotaCr = round2(totals[0].vlr_nota_cr);
  const saldo = calcSaldoFromNotas({
    valorNeto: fcxpRows[0].valor_neto,
    vlrNotaDb,
    vlrNotaCr,
    vlrAbonos: fcxpRows[0].vlr_abonos,
  });

  await client.query(
    `UPDATE fcxp SET vlr_nota_db = $1, vlr_nota_cr = $2, saldo = $3, updated_at = NOW()
     WHERE id = $4 AND company_id = $5`,
    [vlrNotaDb, vlrNotaCr, saldo, fcxpId, companyId],
  );

  return { vlrNotaDb, vlrNotaCr, saldo };
}

async function assertFcxpAllowsNotas(client, fcxpId, companyId) {
  const { rows } = await client.query(
    `SELECT id, status, maneja_doc_soporte, cude, cns_doc_soporte, cns_resol,
            valor_neto, vlr_abonos, vlr_nota_db, vlr_nota_cr
     FROM fcxp WHERE id = $1 AND company_id = $2`,
    [fcxpId, companyId],
  );
  const row = rows[0];
  if (!row) throw Object.assign(new Error('CxP no encontrada'), { status: 404 });
  if (row.status === 'borrador' || row.status === 'anulada') {
    throw Object.assign(new Error('Las notas solo aplican sobre CxP confirmada o posterior'), { status: 400 });
  }
  return row;
}

async function assertDbSaldoNonNegative(client, fcxpRow, tipoNota, vlrNeto, excludeNotaId = null) {
  if (tipoNota !== 'DB') return;

  const values = [fcxpRow.id, NOTA_ACTIVE_STATUSES];
  let excludeSql = '';
  if (excludeNotaId) {
    values.push(excludeNotaId);
    excludeSql = `AND id <> $${values.length}`;
  }

  const { rows } = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo_nota = 'DB' THEN vlr_neto ELSE 0 END), 0) AS db,
       COALESCE(SUM(CASE WHEN tipo_nota = 'CR' THEN vlr_neto ELSE 0 END), 0) AS cr
     FROM fcxpdbcr
     WHERE fcxp_id = $1 AND status = ANY($2::fcxp_nota_status[]) ${excludeSql}`,
    values,
  );

  const projectedDb = round2(Number(rows[0].db) + vlrNeto);
  const projectedCr = round2(Number(rows[0].cr));
  const saldo = calcSaldoFromNotas({
    valorNeto: fcxpRow.valor_neto,
    vlrNotaDb: projectedDb,
    vlrNotaCr: projectedCr,
    vlrAbonos: fcxpRow.vlr_abonos,
  });
  if (saldo < -0.001) {
    throw Object.assign(new Error('La nota débito dejaría el saldo negativo'), { status: 400 });
  }
}

async function persistNotaChildren(client, companyId, notaId, payload) {
  await client.query(`DELETE FROM fcxpdbcrd WHERE fcxpdbcr_id = $1`, [notaId]);
  await client.query(`DELETE FROM fcxpdbcri WHERE fcxpdbcr_id = $1`, [notaId]);

  for (const d of payload.details) {
    await client.query(
      `INSERT INTO fcxpdbcrd (company_id, fcxpdbcr_id, fcxpd_id, vlr_afecta, vlr_iva)
       VALUES ($1,$2,$3,$4,$5)`,
      [companyId, notaId, d.fcxpdId, d.vlrAfecta, d.vlrIva],
    );
  }

  for (let i = 0; i < payload.taxes.length; i += 1) {
    const t = payload.taxes[i];
    await client.query(
      `INSERT INTO fcxpdbcri (
         company_id, fcxpdbcr_id, fcxpi_id, cns_fcxpdbcri, id_impuesto, id_clase, vlr_calc, base, vlr_impuesto
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        companyId, notaId, t.fcxpiId, i + 1, t.idImpuesto, t.idClase,
        t.vlrCalc, t.base, t.vlrImpuesto,
      ],
    );
  }
}

export async function createNota(fcxpId, companyId, userId, body) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fcxpRow = await assertFcxpAllowsNotas(client, fcxpId, companyId);
    const lineDisponibles = await getLineDisponibilidad(client, fcxpId, companyId);
    const taxDisponibles = await getTaxDisponibilidad(client, fcxpId, companyId);
    const payload = normalizeNotaPayload(body, { lineDisponibles, taxDisponibles });
    await assertActiveCndbcrForNota(payload.cndbcrId, companyId);
    await assertDbSaldoNonNegative(client, fcxpRow, payload.tipoNota, payload.vlrNeto);

    const item = await nextNotaItem(client, fcxpId);
    const { rows } = await client.query(
      `INSERT INTO fcxpdbcr (
         company_id, fcxp_id, item, tipo_nota, vlr_nota, afecta_imp, vlr_impuesto,
         afecta_iva, vlr_iva, vlr_neto, mdetalle, detalle, fecha_nota, cndbcr_id, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        companyId, fcxpId, item, payload.tipoNota, payload.vlrNota,
        payload.afectaImp, payload.vlrImpuesto, payload.afectaIva, payload.vlrIva,
        payload.vlrNeto, payload.mdetalle, payload.detalle, payload.fechaNota,
        payload.cndbcrId, userId,
      ],
    );
    await persistNotaChildren(client, companyId, rows[0].id, payload);
    await client.query('COMMIT');
    return loadNota(rows[0].id, companyId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateNota(fcxpId, notaId, companyId, body) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fcxpRow = await assertFcxpAllowsNotas(client, fcxpId, companyId);
    const { rows: notaRows } = await client.query(
      `SELECT * FROM fcxpdbcr WHERE id = $1 AND fcxp_id = $2 AND company_id = $3 FOR UPDATE`,
      [notaId, fcxpId, companyId],
    );
    const nota = notaRows[0];
    if (!nota) throw Object.assign(new Error('Nota no encontrada'), { status: 404 });
    if (nota.status !== 'borrador') {
      throw Object.assign(new Error('Solo se editan notas en borrador'), { status: 400 });
    }

    const lineDisponibles = await getLineDisponibilidad(client, fcxpId, companyId, notaId);
    const taxDisponibles = await getTaxDisponibilidad(client, fcxpId, companyId, notaId);
    const payload = normalizeNotaPayload(body, { lineDisponibles, taxDisponibles });
    await assertActiveCndbcrForNota(payload.cndbcrId, companyId);
    await assertDbSaldoNonNegative(client, fcxpRow, payload.tipoNota, payload.vlrNeto, notaId);

    await client.query(
      `UPDATE fcxpdbcr SET
         tipo_nota = $1, vlr_nota = $2, afecta_imp = $3, vlr_impuesto = $4,
         afecta_iva = $5, vlr_iva = $6, vlr_neto = $7, mdetalle = $8,
         detalle = $9, fecha_nota = $10, cndbcr_id = $11, updated_at = NOW()
       WHERE id = $12`,
      [
        payload.tipoNota, payload.vlrNota, payload.afectaImp, payload.vlrImpuesto,
        payload.afectaIva, payload.vlrIva, payload.vlrNeto, payload.mdetalle,
        payload.detalle, payload.fechaNota, payload.cndbcrId, notaId,
      ],
    );
    await persistNotaChildren(client, companyId, notaId, payload);
    await client.query('COMMIT');
    return loadNota(notaId, companyId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmNota(fcxpId, notaId, companyId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fcxpRow = await assertFcxpAllowsNotas(client, fcxpId, companyId);
    const { rows: notaRows } = await client.query(
      `SELECT * FROM fcxpdbcr WHERE id = $1 AND fcxp_id = $2 AND company_id = $3 FOR UPDATE`,
      [notaId, fcxpId, companyId],
    );
    const nota = notaRows[0];
    if (!nota) throw Object.assign(new Error('Nota no encontrada'), { status: 404 });
    if (nota.status !== 'borrador') {
      throw Object.assign(new Error('Solo se confirman notas en borrador'), { status: 400 });
    }
    if (Number(nota.vlr_neto) <= 0) {
      throw Object.assign(new Error('La nota debe tener valor neto mayor a cero'), { status: 400 });
    }

    await assertDbSaldoNonNegative(client, fcxpRow, nota.tipo_nota, Number(nota.vlr_neto), notaId);

    let cnsDocAjuste = nota.cns_doc_ajuste;
    let cnsResol = nota.cns_resol;

    if (fcxpRow.maneja_doc_soporte) {
      if (!fcxpRow.cns_resol) {
        throw Object.assign(
          new Error('La CxP no tiene resolución DS asignada; confirme la CxP con documento soporte primero'),
          { status: 400 },
        );
      }
      const resolution = await lockNasResolutionForFcxp(client, companyId, fcxpRow.cns_resol);
      if (!resolution) {
        throw Object.assign(
          new Error('Resolución DS de la CxP no encontrada o inactiva'),
          { status: 400 },
        );
      }
      const nasNum = await assignNas95Number(client, resolution);
      cnsResol = nasNum.resolutionId;
      cnsDocAjuste = nasNum.fullNumber;
    }

    await client.query(
      `UPDATE fcxpdbcr SET status = 'confirmada', cns_doc_ajuste = $1, cns_resol = $2, updated_at = NOW()
       WHERE id = $3`,
      [cnsDocAjuste, cnsResol, notaId],
    );
    await recalcFcxpNotaTotals(client, fcxpId, companyId);
    await client.query('COMMIT');
    return loadNota(notaId, companyId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function voidNota(fcxpId, notaId, companyId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertFcxpAllowsNotas(client, fcxpId, companyId);
    const { rows: notaRows } = await client.query(
      `SELECT * FROM fcxpdbcr WHERE id = $1 AND fcxp_id = $2 AND company_id = $3 FOR UPDATE`,
      [notaId, fcxpId, companyId],
    );
    const nota = notaRows[0];
    if (!nota) throw Object.assign(new Error('Nota no encontrada'), { status: 404 });
    if (nota.status === 'aprobada_dian') {
      throw Object.assign(new Error('No se anula una nota ya aprobada por DIAN'), { status: 400 });
    }
    if (nota.status === 'anulada') {
      throw Object.assign(new Error('La nota ya está anulada'), { status: 400 });
    }
    if (!['borrador', 'confirmada', 'enviada_dian', 'rechazada_dian'].includes(nota.status)) {
      throw Object.assign(new Error('Estado de nota no permite anulación'), { status: 400 });
    }

    await client.query(
      `UPDATE fcxpdbcr SET status = 'anulada', updated_at = NOW() WHERE id = $1`,
      [notaId],
    );
    await recalcFcxpNotaTotals(client, fcxpId, companyId);
    await client.query('COMMIT');
    return loadNota(notaId, companyId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function processNotaDianSend(fcxpId, notaId, companyId, userId, loadFcxp) {
  const nota = await loadNota(notaId, companyId);
  if (!nota || nota.fcxpId !== fcxpId) {
    return { httpStatus: 404, body: { error: 'Nota no encontrada' } };
  }

  const fcxp = await loadFcxp(fcxpId, companyId);
  if (!fcxp) return { httpStatus: 404, body: { error: 'CxP no encontrada' } };
  if (!fcxp.manejaDocSoporte) {
    return { httpStatus: 400, body: { error: 'Esta CxP no requiere documento soporte DIAN' } };
  }
  if (!fcxp.cude) {
    return { httpStatus: 400, body: { error: 'El documento soporte origen debe estar aprobado (CUDS)' } };
  }
  if (!['confirmada', 'rechazada_dian'].includes(nota.status)) {
    return { httpStatus: 400, body: { error: 'Solo se envían notas confirmadas o rechazadas previamente' } };
  }
  if (!nota.cnsDocAjuste) {
    return { httpStatus: 400, body: { error: 'La nota no tiene numeración de ajuste asignada' } };
  }

  if (nota.afectaIva && Number(nota.vlrNota) > 0) {
    const base = Number(nota.vlrNota);
    const iva = Number(nota.vlrIva) || 0;
    const rate = Math.round((iva / base) * 10000) / 100;
    const expectedIva = Math.round(base * rate / 100 * 100) / 100;
    if (Math.abs(expectedIva - iva) > 0.02) {
      return {
        httpStatus: 400,
        body: {
          error: 'El IVA de la nota no cuadra con la base imponible. Corrija el valor de IVA o desactive "Afecta IVA".',
        },
      };
    }
  }

  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1 AND company_id = $2`,
    [nota.cnsResol, companyId],
  );
  const resolution = resolutionRows[0] ? formatResolution(resolutionRows[0]) : null;
  if (!resolution) {
    return { httpStatus: 400, body: { error: 'Resolución DIAN de la nota no encontrada' } };
  }

  const { rows: companyRows } = await pool.query(
    `SELECT id, name, nit, email, address, verification_digit, dian_software_id, dian_software_pin, dian_test_set_id,
            dian_cert_subject_cn, dian_cert_subject_nit, dian_cert_subject_dv, dian_cert_valid_from, dian_cert_valid_to,
            dian_cert_fingerprint, dian_cert_storage_key, dian_cert_password_enc, dian_cert_uploaded_at, dian_cert_synced_fepos_at
     FROM companies WHERE id = $1`,
    [companyId],
  );
  if (!companyRows[0]) return { httpStatus: 404, body: { error: 'Compañía no encontrada' } };

  const { rows: allResolutions } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE company_id = $1`,
    [companyId],
  );
  const companyDian = formatCompanyDian(companyRows[0]);
  const certificate = formatCertificateInfo(companyRows[0], companyRows[0].nit, companyRows[0].verification_digit);
  const sendMissing = [
    ...assessDianReadiness({ company: companyDian, resolutions: allResolutions.map(formatResolution) }).missing,
    ...assessCertificateReadiness(certificate, companyRows[0].nit, companyRows[0].verification_digit).missing,
    ...assessFePosSendReadiness({ fePosUrl: config.fePosUrl }).missing,
  ];
  if (sendMissing.length) {
    return { httpStatus: 400, body: { error: 'Faltan datos para enviar a DIAN', missing: sendMissing } };
  }

  const { rows: vendorRows } = await pool.query(
    `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
    [fcxp.idTercero, companyId],
  );
  if (!vendorRows[0]) return { httpStatus: 400, body: { error: 'Tercero no encontrado' } };
  const vendor = formatClient(vendorRows[0]);

  const softwarePin = resolveSecret(companyRows[0].dian_software_pin) || '';
  if (!softwarePin) {
    return { httpStatus: 400, body: { error: 'Configure el PIN del software DIAN' } };
  }

  if (config.fePosCertRoot) {
    const targetDir = path.join(config.fePosCertRoot, String(companyId));
    if (fs.existsSync(path.join(targetDir, 'cert.p12'))) {
      syncFePosCompanyMeta(companyId, {
        softwareId: companyDian.dianSoftwareId || '',
        nit: companyDian.nit || '',
        dianEnvironment: resolution.dianEnvironment || '',
      });
    }
  }

  const now = new Date();
  const issueDate = nota.issueDate || now.toISOString().slice(0, 10);
  const issueTime = nota.issueTime || now.toTimeString().slice(0, 8);
  await pool.query(
    `UPDATE fcxpdbcr SET issue_date = $1, issue_time = $2, updated_at = NOW() WHERE id = $3`,
    [issueDate, issueTime, notaId],
  );

  let ublLines;
  if (nota.mdetalle) {
    ublLines = nota.details.map((d, idx) => {
      const fcxpLine = fcxp.details.find((l) => l.id === d.fcxpdId);
      const qty = 1;
      const lineBase = d.vlrAfecta;
      return {
        lineNumber: idx + 1,
        itemCode: fcxpLine?.serviceCode || String(fcxpLine?.item || idx + 1),
        description: d.descripcion || fcxpLine?.descripcion || 'Ajuste',
        quantity: qty,
        unitPrice: lineBase,
        lineBase,
        taxAmount: nota.afectaIva ? d.vlrIva : 0,
        taxRate: lineBase > 0 && d.vlrIva > 0 ? (d.vlrIva / lineBase) * 100 : 0,
      };
    });
  } else {
    ublLines = [{
      lineNumber: 1,
      itemCode: '1',
      description: nota.detalle || 'Nota de ajuste documento soporte',
      quantity: 1,
      unitPrice: nota.vlrNota,
      lineBase: nota.vlrNota,
      taxAmount: nota.afectaIva ? nota.vlrIva : 0,
      taxRate: nota.vlrNota > 0 && nota.vlrIva > 0 ? (nota.vlrIva / nota.vlrNota) * 100 : 0,
    }];
  }

  const withholdingTaxes = nota.taxes.map((t) => ({
    vlrImpuesto: t.vlrImpuesto,
    base: t.base,
    vlrCalc: t.vlrCalc,
    taxCode: t.taxCode || '06',
    taxName: t.taxCode === '05' ? 'ReteIVA' : 'ReteRenta',
  }));

  let requestXml;
  try {
    const conceptUbl = nota.dianCode
      ? buildAdjustmentNoteConceptUbl({
        dianCode: nota.dianCode,
        description: nota.conceptoDescripcion || nota.detalle,
      })
      : null;
    requestXml = buildSupportAdjustmentNoteUbl({
      nota: { ...nota, issueDate, issueTime },
      fcxp,
      company: {
        ...companyDian,
        dianSoftwareId: companyRows[0].dian_software_id,
        verificationDigit: companyRows[0].verification_digit,
      },
      vendor,
      resolution,
      lines: ublLines,
      withholdingTaxes,
      conceptUbl,
    });
  } catch (err) {
    return { httpStatus: 500, body: { error: `No se pudo generar XML NAS: ${err.message}` } };
  }

  const { rows: prev } = await pool.query(
    `SELECT COUNT(*) AS count FROM fcxpdbcr_dian_submissions WHERE fcxpdbcr_id = $1`,
    [notaId],
  );
  const attempt = Number(prev[0].count) + 1;

  const { rows: pendingRows } = await pool.query(
    `INSERT INTO fcxpdbcr_dian_submissions (
       company_id, fcxpdbcr_id, attempt_number, dian_environment, status, request_xml, sent_at, created_by
     ) VALUES ($1,$2,$3,$4,'pendiente',$5,NOW(),$6) RETURNING *`,
    [companyId, notaId, attempt, resolution.dianEnvironment, requestXml, userId],
  );

  const fePosPing = await pingFePos();
  if (!fePosPing.ok) {
    const pingMsg = `ServerFEpos no disponible (${fePosPing.error})`;
    const { rows: errorRows } = await pool.query(
      `UPDATE fcxpdbcr_dian_submissions SET status = 'error', status_code = '503', status_message = $1,
       is_success = false, responded_at = NOW() WHERE id = $2 RETURNING *`,
      [pingMsg, pendingRows[0].id],
    );
    return { httpStatus: 503, body: { error: pingMsg, submission: formatNotaSubmission(errorRows[0]) } };
  }
  if (fePosPing.payload?.dianDnsFix === false || !fePosPing.payload?.dianDnsFix) {
    const fePosUrl = config.fePosUrl || fePosPing.payload?.port || '?';
    const pingMsg = `ServerFEpos sin parche DNS DIAN (${fePosUrl}). Ejecute .\\Scripts\\restart-fepos.ps1 -ForceReload y use API con FEPOS_URL=http://localhost:3011 (puerto 3504).`;
    const { rows: errorRows } = await pool.query(
      `UPDATE fcxpdbcr_dian_submissions SET status = 'error', status_code = '503', status_message = $1,
       is_success = false, responded_at = NOW() WHERE id = $2 RETURNING *`,
      [pingMsg, pendingRows[0].id],
    );
    return { httpStatus: 503, body: { error: pingMsg, submission: formatNotaSubmission(errorRows[0]) } };
  }

  let fePosResult;
  try {
    fePosResult = await sendInvoiceToFePos({
      companyId,
      technicalKey: resolution.technicalKey || '',
      softwarePin,
      softwareId: companyDian.dianSoftwareId || '',
      dianEnvironment: resolution.dianEnvironment || '',
      testSetId: usesDianTestSet(resolution.dianEnvironment)
        ? (companyRows[0].dian_test_set_id || '')
        : '',
      xml: requestXml,
    });
  } catch (err) {
    const { rows: errorRows } = await pool.query(
      `UPDATE fcxpdbcr_dian_submissions SET status = 'error', status_code = $1, status_message = $2,
       is_success = false, responded_at = NOW() WHERE id = $3 RETURNING *`,
      [String(err.status || '502'), err.message, pendingRows[0].id],
    );
    await pool.query(
      `UPDATE fcxpdbcr SET status = 'rechazada_dian', est_dian = $1, updated_at = NOW() WHERE id = $2`,
      [err.message, notaId],
    );
    return {
      httpStatus: err.status === 400 ? 400 : 502,
      body: { error: err.message, submission: formatNotaSubmission(errorRows[0]) },
    };
  }

  const { approved, statusCode, statusMessage, submissionStatus, notaStatus } =
    resolveSubmissionFromFePos(fePosResult);

  const { rows: finalRows } = await pool.query(
    `UPDATE fcxpdbcr_dian_submissions SET
       status = $1, status_code = $2, status_message = $3,
       signed_xml = COALESCE($4, signed_xml), response_xml = $5,
       zip_file_name = COALESCE($6, zip_file_name), track_id = COALESCE($7, track_id),
       uuid = COALESCE($8, uuid), is_success = $9, responded_at = NOW()
     WHERE id = $10 RETURNING *`,
    [
      submissionStatus,
      statusCode,
      statusMessage,
      fePosResult.signedXml || null,
      fePosResult.responseXml || null,
      fePosResult.zipFileName || null,
      fePosResult.trackId || null,
      fePosResult.cufe || fePosResult.cude || fePosResult.uuid || null,
      approved,
      pendingRows[0].id,
    ],
  );

  const cude = fePosResult.cufe || fePosResult.cude || fePosResult.uuid || null;
  await pool.query(
    `UPDATE fcxpdbcr SET status = $1, est_dian = $2, cude = COALESCE($3, cude), updated_at = NOW() WHERE id = $4`,
    [notaStatus, statusMessage, cude, notaId],
  );

  return {
    httpStatus: 200,
    body: {
      ok: true,
      approved,
      submission: formatNotaSubmission(finalRows[0]),
      nota: await loadNota(notaId, companyId),
      fcxp: await loadFcxp(fcxpId, companyId),
    },
  };
}

export async function getNotaSubmissionDetail(fcxpId, notaId, companyId, attempt) {
  const nota = await loadNota(notaId, companyId);
  if (!nota || nota.fcxpId !== fcxpId) return null;

  const { rows } = await pool.query(
    `SELECT * FROM fcxpdbcr_dian_submissions
     WHERE fcxpdbcr_id = $1 AND company_id = $2 AND attempt_number = $3`,
    [notaId, companyId, attempt],
  );
  const submission = rows[0];
  if (!submission) return null;

  const responseText = submission.response_xml
    ? formatDianResponseForDisplay(submission.response_xml)
    : submission.status_message || '';
  const validationErrors = submission.response_xml
    ? extractDianValidationErrors(submission.response_xml)
    : [];

  return {
    attemptNumber: submission.attempt_number,
    status: submission.status,
    statusCode: submission.status_code,
    statusMessage: submission.status_message,
    trackId: submission.track_id,
    uuid: submission.uuid,
    isSuccess: submission.is_success,
    hasRequestXml: Boolean(submission.request_xml),
    hasSignedXml: Boolean(submission.signed_xml),
    hasResponseXml: Boolean(submission.response_xml),
    requestXml: submission.request_xml,
    signedXml: submission.signed_xml,
    responseText,
    validationErrors,
  };
}

export async function getDisponibilidad(fcxpId, companyId, excludeNotaId = null) {
  const client = await pool.connect();
  try {
    await assertFcxpAllowsNotas(client, fcxpId, companyId);
    const lines = await getLineDisponibilidad(client, fcxpId, companyId, excludeNotaId);
    const taxes = await getTaxDisponibilidad(client, fcxpId, companyId, excludeNotaId);
    return { lines, taxes };
  } finally {
    client.release();
  }
}
