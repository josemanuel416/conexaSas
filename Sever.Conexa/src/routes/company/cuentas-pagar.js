import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../../db/pool.js';
import { config } from '../../config.js';
import { requirePermission } from '../../middleware/permissions.js';
import { formatClient, clientFullNameExpr } from '../../utils/client-format.js';
import { buildSupportDocumentUbl } from '../../utils/ubl-support-document.js';
import { pingFePos, sendInvoiceToFePos } from '../../utils/fepos-client.js';
import { assessDianReadiness, formatCompanyDian } from '../../utils/dian-readiness.js';
import {
  assessCertificateReadiness,
  assessFePosSendReadiness,
  formatCertificateInfo,
  resolveSecret,
  syncFePosCompanyMeta,
} from '../../utils/dian-certificate.js';
import { usesDianTestSet } from '../../utils/dian-environment.js';
import { buildFcxpPdf, buildFcxpPdfFileName } from '../../utils/fcxp-pdf.js';
import { extractDianValidationErrors, formatDianResponseForDisplay } from '../../utils/dian-response.js';
import { calcSaldoFromNotas } from '../../utils/fcxp-notas.js';
import { registerFcxpNotasRoutes } from './fcxp-notas-routes.js';
import {
  listCndbcr,
  loadCndbcr,
  validateCndbcrPayload,
  assertCndbcrAccount,
} from '../../utils/cndbcr.js';
import { DIAN_ADJUSTMENT_NOTE_CONCEPTS } from '../../utils/dian-adjustment-note-concepts.js';

const router = Router();

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

function formatDetail(d) {
  return {
    id: d.id,
    item: d.item,
    idServicio: d.id_servicio,
    serviceCode: d.service_code,
    serviceDescription: d.service_description,
    descripcion: d.descripcion,
    valor: Number(d.valor),
    cantidad: Number(d.cantidad),
    vlrIva: Number(d.vlr_iva),
    vlrDescuento: Number(d.vlr_descuento),
    vlrImpConsumo: Number(d.vlr_imp_consumo),
    vlrNeto: Number(d.vlr_neto),
    cuentaConta: d.cuenta_conta,
  };
}

function formatTax(t) {
  return {
    id: t.id,
    cnsFcxpi: t.cns_fcxpi,
    idImpuesto: t.id_impuesto,
    idClase: t.id_clase,
    taxCode: t.tax_code,
    classCode: t.class_code,
    vlrCalc: Number(t.vlr_calc),
    base: Number(t.base),
    vlrImpuesto: Number(t.vlr_impuesto),
    cuentaConta: t.cuenta_conta,
  };
}

function formatSubmission(s) {
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

function formatFcxp(row, details = [], taxes = [], submissions = []) {
  return {
    id: row.id,
    cnsFcxp: Number(row.cns_fcxp),
    cnsInterno: row.cns_interno,
    fechaCxp: row.fecha_cxp,
    nroFactura: row.nro_factura,
    fechaFactura: row.fecha_factura,
    fechaVence: row.fecha_vence,
    idTercero: row.id_tercero,
    terceroNombre: row.tercero_nombre,
    terceroDocumento: row.tercero_documento,
    detalle: row.detalle,
    manejaDocSoporte: row.maneja_doc_soporte,
    cnsDocSoporte: row.cns_doc_soporte,
    cnsResol: row.cns_resol,
    resolutionPrefix: row.resolution_prefix,
    estDian: row.est_dian,
    cude: row.cude,
    cuentaConta: row.cuenta_conta,
    contabilizada: row.contabilizada,
    nroComprobante: row.nro_comprobante,
    vlrBruto: Number(row.vlr_bruto),
    vlrIva: Number(row.vlr_iva),
    vlrImpuestos: Number(row.vlr_impuestos),
    valorNeto: Number(row.valor_neto),
    vlrNotaDb: Number(row.vlr_nota_db),
    vlrNotaCr: Number(row.vlr_nota_cr),
    vlrAbonos: Number(row.vlr_abonos),
    saldo: Number(row.saldo),
    status: row.status,
    issueDate: row.issue_date,
    issueTime: row.issue_time ? String(row.issue_time).slice(0, 8) : null,
    details,
    taxes,
    submissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function calcSaldo({ valorNeto, vlrNotaCr, vlrAbonos, vlrNotaDb }) {
  return calcSaldoFromNotas({ valorNeto, vlrNotaDb, vlrNotaCr, vlrAbonos });
}

function calcTotalsFromLines(lines, taxes = []) {
  let vlrBruto = 0;
  let vlrIva = 0;
  let vlrImpConsumo = 0;
  for (const line of lines) {
    const qty = Number(line.cantidad ?? line.quantity ?? 1);
    const unit = Number(line.valor ?? line.unitPrice ?? 0);
    const discount = Number(line.vlrDescuento ?? line.discountAmount ?? 0);
    const lineBase = Math.max(0, qty * unit - discount);
    vlrBruto += lineBase;
    vlrIva += Number(line.vlrIva ?? line.taxAmount ?? 0);
    vlrImpConsumo += Number(line.vlrImpConsumo ?? 0);
  }
  const extraTaxes = taxes.reduce((sum, t) => sum + Number(t.vlrImpuesto ?? t.vlr_impuesto ?? 0), 0);
  const vlrImpuestos = vlrImpConsumo + extraTaxes;
  const valorNeto = Math.round((vlrBruto + vlrIva + vlrImpuestos) * 100) / 100;
  return {
    vlrBruto: Math.round(vlrBruto * 100) / 100,
    vlrIva: Math.round(vlrIva * 100) / 100,
    vlrImpuestos: Math.round(vlrImpuestos * 100) / 100,
    valorNeto,
  };
}

async function nextCnsFcxp(client, companyId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(cns_fcxp), 0) + 1 AS next FROM fcxp WHERE company_id = $1`,
    [companyId],
  );
  return Number(rows[0].next);
}

async function loadFcxp(id, companyId) {
  const { rows } = await pool.query(
    `SELECT f.*,
            ${clientFullNameExpr('c')} AS tercero_nombre,
            CONCAT(c.document_type, ' ', c.document_number) AS tercero_documento,
            dr.prefix AS resolution_prefix
     FROM fcxp f
     JOIN clients c ON c.id = f.id_tercero
     LEFT JOIN dian_resolutions dr ON dr.id = f.cns_resol
     WHERE f.id = $1 AND f.company_id = $2`,
    [id, companyId],
  );
  if (!rows[0]) return null;

  const { rows: detailRows } = await pool.query(
    `SELECT d.*, s.code AS service_code, s.description AS service_description
     FROM fcxpd d
     LEFT JOIN services s ON s.id = d.id_servicio
     WHERE d.fcxp_id = $1 ORDER BY d.item`,
    [id],
  );
  const { rows: taxRows } = await pool.query(
    `SELECT t.*, at.code AS tax_code, tc.class_code
     FROM fcxpi t
     LEFT JOIN accounting_taxes at ON at.id = t.id_impuesto
     LEFT JOIN accounting_tax_classes tc ON tc.id = t.id_clase
     WHERE t.fcxp_id = $1 ORDER BY t.cns_fcxpi`,
    [id],
  );
  const { rows: subRows } = await pool.query(
    `SELECT * FROM fcxp_dian_submissions WHERE fcxp_id = $1 ORDER BY attempt_number`,
    [id],
  );
  return formatFcxp(
    rows[0],
    detailRows.map(formatDetail),
    taxRows.map(formatTax),
    subRows.map(formatSubmission),
  );
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
  const fcxpStatus = approved ? 'aprobada_dian' : pending ? 'enviada_dian' : 'rechazada_dian';
  return { approved, pending, statusCode, statusMessage, submissionStatus, fcxpStatus };
}

async function lockDsResolution(client, companyId) {
  const { rows } = await client.query(
    `SELECT * FROM dian_resolutions
     WHERE company_id = $1 AND document_process = 'DS' AND document_type = '05' AND is_active = true
     FOR UPDATE`,
    [companyId],
  );
  return rows[0] || null;
}

async function assignDsNumber(client, resolution) {
  const next = Number(resolution.current_consecutive) + 1;
  if (next > Number(resolution.range_to)) {
    throw Object.assign(new Error('Rango de numeración DS agotado'), { status: 400 });
  }
  await client.query(
    `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
    [next, resolution.id],
  );
  const fullNumber = `${resolution.prefix}${String(next).padStart(8, '0')}`;
  return { consecutive: next, fullNumber };
}

async function processFcxpDianSend(fcxpId, companyId, userId) {
  const fcxp = await loadFcxp(fcxpId, companyId);
  if (!fcxp) return { httpStatus: 404, body: { error: 'CxP no encontrada' } };
  if (!fcxp.manejaDocSoporte) {
    return { httpStatus: 400, body: { error: 'Esta CxP no requiere documento soporte DIAN' } };
  }
  if (!['confirmada', 'rechazada_dian'].includes(fcxp.status)) {
    return { httpStatus: 400, body: { error: 'Solo se envían CxP confirmadas o rechazadas previamente' } };
  }
  if (!fcxp.cnsDocSoporte) {
    return { httpStatus: 400, body: { error: 'La CxP no tiene número de documento soporte asignado' } };
  }

  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1 AND company_id = $2`,
    [fcxp.cnsResol, companyId],
  );
  const resolution = resolutionRows[0] ? formatResolution(resolutionRows[0]) : null;
  if (!resolution) {
    return { httpStatus: 400, body: { error: 'Resolución DS no encontrada' } };
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
  const issueDate = fcxp.issueDate || now.toISOString().slice(0, 10);
  const issueTime = fcxp.issueTime || now.toTimeString().slice(0, 8);
  await pool.query(
    `UPDATE fcxp SET issue_date = $1, issue_time = $2, updated_at = NOW() WHERE id = $3`,
    [issueDate, issueTime, fcxpId],
  );

  const ublPayload = {
    fcxp: { ...fcxp, issueDate, issueTime },
    company: {
      ...companyDian,
      dianSoftwareId: companyRows[0].dian_software_id,
      verificationDigit: companyRows[0].verification_digit,
    },
    vendor,
    resolution,
    lines: fcxp.details.map((d) => ({
      lineNumber: d.item,
      itemCode: d.serviceCode || String(d.item || '1'),
      description: d.descripcion || d.serviceDescription || 'Servicio',
      quantity: d.cantidad,
      unitPrice: d.valor,
      discountAmount: d.vlrDescuento,
      taxAmount: d.vlrIva,
    })),
  };

  let requestXml;
  try {
    requestXml = buildSupportDocumentUbl(ublPayload);
  } catch (err) {
    return { httpStatus: 500, body: { error: `No se pudo generar XML DS: ${err.message}` } };
  }

  const { rows: prev } = await pool.query(
    `SELECT COUNT(*) AS count FROM fcxp_dian_submissions WHERE fcxp_id = $1`,
    [fcxpId],
  );
  const attempt = Number(prev[0].count) + 1;

  const { rows: pendingRows } = await pool.query(
    `INSERT INTO fcxp_dian_submissions (
       company_id, fcxp_id, attempt_number, dian_environment, status, request_xml, sent_at, created_by
     ) VALUES ($1,$2,$3,$4,'pendiente',$5,NOW(),$6) RETURNING *`,
    [companyId, fcxpId, attempt, resolution.dianEnvironment, requestXml, userId],
  );

  const fePosPing = await pingFePos();
  if (!fePosPing.ok) {
    const pingMsg = `ServerFEpos no disponible (${fePosPing.error})`;
    const { rows: errorRows } = await pool.query(
      `UPDATE fcxp_dian_submissions SET status = 'error', status_code = '503', status_message = $1,
       is_success = false, responded_at = NOW() WHERE id = $2 RETURNING *`,
      [pingMsg, pendingRows[0].id],
    );
    return { httpStatus: 503, body: { error: pingMsg, submission: formatSubmission(errorRows[0]) } };
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
      `UPDATE fcxp_dian_submissions SET status = 'error', status_code = $1, status_message = $2,
       is_success = false, responded_at = NOW() WHERE id = $3 RETURNING *`,
      [String(err.status || '502'), err.message, pendingRows[0].id],
    );
    await pool.query(`UPDATE fcxp SET status = 'rechazada_dian', est_dian = $1, updated_at = NOW() WHERE id = $2`, [
      err.message, fcxpId,
    ]);
    return {
      httpStatus: err.status === 400 ? 400 : 502,
      body: { error: err.message, submission: formatSubmission(errorRows[0]) },
    };
  }

  const { approved, statusCode, statusMessage, submissionStatus, fcxpStatus } =
    resolveSubmissionFromFePos(fePosResult);

  const { rows: finalRows } = await pool.query(
    `UPDATE fcxp_dian_submissions SET
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
    `UPDATE fcxp SET status = $1, est_dian = $2, cude = COALESCE($3, cude), updated_at = NOW() WHERE id = $4`,
    [fcxpStatus, statusMessage, cude, fcxpId],
  );

  return {
    httpStatus: 200,
    body: {
      ok: true,
      approved,
      submission: formatSubmission(finalRows[0]),
      fcxp: await loadFcxp(fcxpId, companyId),
    },
  };
}

router.get('/', requirePermission('cuentas_pagar.acceso'), async (req, res) => {
  const { status, terceroId } = req.query;
  const values = [req.user.companyId];
  let sql = `
    SELECT f.*,
           ${clientFullNameExpr('c')} AS tercero_nombre,
           CONCAT(c.document_type, ' ', c.document_number) AS tercero_documento,
           dr.prefix AS resolution_prefix
    FROM fcxp f
    JOIN clients c ON c.id = f.id_tercero
    LEFT JOIN dian_resolutions dr ON dr.id = f.cns_resol
    WHERE f.company_id = $1`;
  if (status) {
    values.push(status);
    sql += ` AND f.status = $${values.length}`;
  }
  if (terceroId) {
    values.push(terceroId);
    sql += ` AND f.id_tercero = $${values.length}`;
  }
  sql += ' ORDER BY f.fecha_cxp DESC, f.cns_fcxp DESC LIMIT 500';
  const { rows } = await pool.query(sql, values);
  res.json(rows.map((r) => formatFcxp(r)));
});

router.get('/conceptos-notas/dian', requirePermission('cuentas_pagar.acceso'), (_req, res) => {
  res.json(DIAN_ADJUSTMENT_NOTE_CONCEPTS);
});

router.get('/conceptos-notas', requirePermission('cuentas_pagar.acceso'), async (req, res) => {
  const activeOnly = req.query.active === '1' || req.query.active === 'true';
  res.json(await listCndbcr(req.user.companyId, { activeOnly }));
});

router.post('/conceptos-notas', requirePermission('cuentas_pagar.config', 'cuentas_pagar.registrar'), async (req, res) => {
  try {
    const payload = validateCndbcrPayload(req.body);
    const cuentaConta = await assertCndbcrAccount(req.user.companyId, payload.cuentaConta);
    const { rows } = await pool.query(
      `INSERT INTO cndbcr (company_id, concepto, descripcion, cuenta_conta, dian_code, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.companyId,
        payload.concepto,
        payload.descripcion,
        cuentaConta,
        payload.dianCode,
        payload.status,
        payload.sortOrder,
      ],
    );
    res.status(201).json(await loadCndbcr(rows[0].id, req.user.companyId));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un concepto con ese código interno' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.put('/conceptos-notas/:conceptoId', requirePermission('cuentas_pagar.config', 'cuentas_pagar.registrar'), async (req, res) => {
  try {
    const existing = await loadCndbcr(req.params.conceptoId, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Concepto no encontrado' });

    const payload = validateCndbcrPayload(req.body, { isUpdate: true });
    const cuentaConta = payload.cuentaConta !== null
      ? await assertCndbcrAccount(req.user.companyId, payload.cuentaConta)
      : existing.cuentaConta;

    await pool.query(
      `UPDATE cndbcr SET
         concepto = COALESCE($1, concepto),
         descripcion = COALESCE($2, descripcion),
         cuenta_conta = $3,
         dian_code = COALESCE($4, dian_code),
         status = COALESCE($5, status),
         sort_order = COALESCE($6, sort_order),
         updated_at = NOW()
       WHERE id = $7 AND company_id = $8`,
      [
        payload.concepto,
        payload.descripcion,
        cuentaConta,
        payload.dianCode,
        payload.status,
        payload.sortOrder,
        req.params.conceptoId,
        req.user.companyId,
      ],
    );
    res.json(await loadCndbcr(req.params.conceptoId, req.user.companyId));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un concepto con ese código interno' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

registerFcxpNotasRoutes(router, { loadFcxp });

router.get('/:id/pdf', requirePermission('cuentas_pagar.acceso'), async (req, res) => {
  const fcxp = await loadFcxp(req.params.id, req.user.companyId);
  if (!fcxp) return res.status(404).json({ error: 'CxP no encontrada' });
  try {
    const { rows } = await pool.query(
      `SELECT name, nit, address, phone, logo_path, verification_digit,
              theme_primary, theme_secondary, theme_accent
       FROM companies WHERE id = $1`,
      [req.user.companyId],
    );
    const company = rows[0] || {};
    const { rows: userRows } = await pool.query(
      `SELECT email, full_name FROM users WHERE id = $1`,
      [req.user.userId],
    );
    const printedByUser = userRows[0] || {};
    const { rows: submissionRows } = await pool.query(
      `SELECT signed_xml, dian_environment
       FROM fcxp_dian_submissions
       WHERE fcxp_id = $1 AND signed_xml IS NOT NULL
       ORDER BY is_success DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [fcxp.id],
    );
    const pdfBuffer = await buildFcxpPdf({
      company: {
        name: company.name,
        nit: company.nit,
        address: company.address,
        phone: company.phone,
        logoPath: company.logo_path,
        verificationDigit: company.verification_digit,
        themePrimary: company.theme_primary,
        themeSecondary: company.theme_secondary,
        themeAccent: company.theme_accent,
      },
      fcxp,
      printedBy: {
        email: printedByUser.email || req.user.email,
        fullName: printedByUser.full_name,
      },
      signedXml: submissionRows[0]?.signed_xml || null,
      dianEnvironment: submissionRows[0]?.dian_environment || '',
    });
    const fileName = buildFcxpPdfFileName(fcxp);
    const forceDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Download-Filename', fileName);
    res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[fcxp-pdf]', err);
    res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
  }
});

router.get('/:id', requirePermission('cuentas_pagar.acceso'), async (req, res) => {
  const item = await loadFcxp(req.params.id, req.user.companyId);
  if (!item) return res.status(404).json({ error: 'CxP no encontrada' });
  res.json(item);
});

router.post('/', requirePermission('cuentas_pagar.registrar'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      idTercero, fechaCxp, nroFactura, fechaFactura, fechaVence, detalle,
      cnsInterno, cuentaConta, vlrAbonos,
      details = [], taxes = [],
    } = req.body;

    if (!idTercero) {
      return res.status(400).json({ error: 'Tercero requerido' });
    }

    const { rows: terceroRows } = await client.query(
      `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
      [idTercero, req.user.companyId],
    );
    if (!terceroRows[0]) return res.status(400).json({ error: 'Tercero no encontrado' });

    const totals = calcTotalsFromLines(details, taxes);
    const saldo = calcSaldo({
      valorNeto: totals.valorNeto,
      vlrNotaCr: 0,
      vlrAbonos: vlrAbonos || 0,
      vlrNotaDb: 0,
    });
    const cnsFcxp = await nextCnsFcxp(client, req.user.companyId);

    const { rows } = await client.query(
      `INSERT INTO fcxp (
         company_id, cns_fcxp, cns_interno, fecha_cxp, nro_factura, fecha_factura, fecha_vence,
         id_tercero, detalle, maneja_doc_soporte, cuenta_conta,
         vlr_bruto, vlr_iva, vlr_impuestos, valor_neto, vlr_nota_db, vlr_nota_cr, vlr_abonos, saldo,
         created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        req.user.companyId, cnsFcxp, cnsInterno || null, fechaCxp || new Date().toISOString().slice(0, 10),
        nroFactura || null, fechaFactura || null, fechaVence || null,
        idTercero, detalle || null, terceroRows[0].maneja_doc_soporte, cuentaConta || null,
        totals.vlrBruto, totals.vlrIva, totals.vlrImpuestos, totals.valorNeto,
        0, 0, vlrAbonos || 0, saldo,
        req.user.userId,
      ],
    );
    const fcxpId = rows[0].id;

    for (let i = 0; i < details.length; i += 1) {
      const d = details[i];
      const qty = Number(d.cantidad ?? d.quantity ?? 1);
      const unit = Number(d.valor ?? d.unitPrice ?? 0);
      const discount = Number(d.vlrDescuento ?? d.discountAmount ?? 0);
      const lineBase = Math.max(0, qty * unit - discount);
      const vlrIvaLine = Number(d.vlrIva ?? d.taxAmount ?? 0);
      const vlrNetoLine = Math.round((lineBase + vlrIvaLine + Number(d.vlrImpConsumo ?? 0)) * 100) / 100;
      await client.query(
        `INSERT INTO fcxpd (
           company_id, fcxp_id, item, id_servicio, descripcion, valor, cantidad,
           vlr_iva, vlr_descuento, vlr_imp_consumo, vlr_neto, cuenta_conta
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          req.user.companyId, fcxpId, d.item ?? i + 1, d.idServicio || null,
          d.descripcion || d.description || null, unit, qty,
          vlrIvaLine, discount, Number(d.vlrImpConsumo ?? 0), vlrNetoLine, d.cuentaConta || null,
        ],
      );
    }

    for (let i = 0; i < taxes.length; i += 1) {
      const t = taxes[i];
      await client.query(
        `INSERT INTO fcxpi (
           company_id, fcxp_id, cns_fcxpi, id_impuesto, id_clase, vlr_calc, base, vlr_impuesto, cuenta_conta
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          req.user.companyId, fcxpId, t.cnsFcxpi ?? i + 1, t.idImpuesto || null, t.idClase || null,
          t.vlrCalc ?? 0, t.base ?? 0, t.vlrImpuesto ?? 0, t.cuentaConta || null,
        ],
      );
    }

    await client.query('COMMIT');
    res.status(201).json(await loadFcxp(fcxpId, req.user.companyId));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.put('/:id', requirePermission('cuentas_pagar.registrar'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await loadFcxp(req.params.id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'CxP no encontrada' });
    if (existing.status !== 'borrador') {
      return res.status(400).json({ error: 'Solo se editan CxP en borrador' });
    }

    const {
      idTercero, fechaCxp, nroFactura, fechaFactura, fechaVence, detalle,
      cnsInterno, cuentaConta, vlrAbonos,
      details = [], taxes = [],
    } = req.body;

    const { rows: terceroRows } = await client.query(
      `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
      [idTercero || existing.idTercero, req.user.companyId],
    );
    if (!terceroRows[0]) return res.status(400).json({ error: 'Tercero no encontrado' });

    const totals = calcTotalsFromLines(details, taxes);
    const saldo = calcSaldo({
      valorNeto: totals.valorNeto,
      vlrNotaCr: existing.vlrNotaCr,
      vlrAbonos: vlrAbonos ?? existing.vlrAbonos,
      vlrNotaDb: existing.vlrNotaDb,
    });

    await client.query(
      `UPDATE fcxp SET
         cns_interno = $1, fecha_cxp = $2, nro_factura = $3, fecha_factura = $4, fecha_vence = $5,
         id_tercero = $6, detalle = $7, maneja_doc_soporte = $8, cuenta_conta = $9,
         vlr_bruto = $10, vlr_iva = $11, vlr_impuestos = $12, valor_neto = $13,
         vlr_abonos = $14, saldo = $15, updated_at = NOW()
       WHERE id = $16 AND company_id = $17`,
      [
        cnsInterno ?? existing.cnsInterno, fechaCxp ?? existing.fechaCxp,
        nroFactura ?? existing.nroFactura, fechaFactura ?? existing.fechaFactura,
        fechaVence ?? existing.fechaVence, idTercero ?? existing.idTercero,
        detalle ?? existing.detalle, terceroRows[0].maneja_doc_soporte,
        cuentaConta ?? existing.cuentaConta,
        totals.vlrBruto, totals.vlrIva, totals.vlrImpuestos, totals.valorNeto,
        vlrAbonos ?? existing.vlrAbonos, saldo,
        req.params.id, req.user.companyId,
      ],
    );

    await client.query(`DELETE FROM fcxpd WHERE fcxp_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM fcxpi WHERE fcxp_id = $1`, [req.params.id]);

    for (let i = 0; i < details.length; i += 1) {
      const d = details[i];
      const qty = Number(d.cantidad ?? d.quantity ?? 1);
      const unit = Number(d.valor ?? d.unitPrice ?? 0);
      const discount = Number(d.vlrDescuento ?? d.discountAmount ?? 0);
      const lineBase = Math.max(0, qty * unit - discount);
      const vlrIvaLine = Number(d.vlrIva ?? d.taxAmount ?? 0);
      const vlrNetoLine = Math.round((lineBase + vlrIvaLine + Number(d.vlrImpConsumo ?? 0)) * 100) / 100;
      await client.query(
        `INSERT INTO fcxpd (
           company_id, fcxp_id, item, id_servicio, descripcion, valor, cantidad,
           vlr_iva, vlr_descuento, vlr_imp_consumo, vlr_neto, cuenta_conta
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          req.user.companyId, req.params.id, d.item ?? i + 1, d.idServicio || null,
          d.descripcion || d.description || null, unit, qty,
          vlrIvaLine, discount, Number(d.vlrImpConsumo ?? 0), vlrNetoLine, d.cuentaConta || null,
        ],
      );
    }

    for (let i = 0; i < taxes.length; i += 1) {
      const t = taxes[i];
      await client.query(
        `INSERT INTO fcxpi (
           company_id, fcxp_id, cns_fcxpi, id_impuesto, id_clase, vlr_calc, base, vlr_impuesto, cuenta_conta
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          req.user.companyId, req.params.id, t.cnsFcxpi ?? i + 1, t.idImpuesto || null, t.idClase || null,
          t.vlrCalc ?? 0, t.base ?? 0, t.vlrImpuesto ?? 0, t.cuentaConta || null,
        ],
      );
    }

    await client.query('COMMIT');
    res.json(await loadFcxp(req.params.id, req.user.companyId));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.post('/:id/confirm', requirePermission('cuentas_pagar.confirmar'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM fcxp WHERE id = $1 AND company_id = $2 FOR UPDATE`,
      [req.params.id, req.user.companyId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'CxP no encontrada' });
    if (row.status !== 'borrador') {
      return res.status(400).json({ error: 'Solo se confirman CxP en borrador' });
    }

    const { rows: detailCheck } = await client.query(
      `SELECT COUNT(*) AS count FROM fcxpd WHERE fcxp_id = $1`,
      [req.params.id],
    );
    if (Number(detailCheck[0].count) === 0) {
      return res.status(400).json({ error: 'Agregue al menos una línea de detalle' });
    }

    let cnsResol = row.cns_resol;
    let cnsDocSoporte = row.cns_doc_soporte;

    if (row.maneja_doc_soporte) {
      const resolution = await lockDsResolution(client, req.user.companyId);
      if (!resolution) {
        return res.status(400).json({ error: 'Configure una resolución DS activa (tipo 05)' });
      }
      const dsNum = await assignDsNumber(client, resolution);
      cnsResol = resolution.id;
      cnsDocSoporte = dsNum.fullNumber;
    }

    await client.query(
      `UPDATE fcxp SET status = 'confirmada', cns_resol = $1, cns_doc_soporte = $2, updated_at = NOW()
       WHERE id = $3`,
      [cnsResol, cnsDocSoporte, req.params.id],
    );
    await client.query('COMMIT');
    res.json(await loadFcxp(req.params.id, req.user.companyId));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.post('/:id/send-dian', requirePermission('cuentas_pagar.enviar_dian'), async (req, res) => {
  const result = await processFcxpDianSend(req.params.id, req.user.companyId, req.user.userId);
  res.status(result.httpStatus).json(result.body);
});

router.get('/:id/submissions', requirePermission('cuentas_pagar.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM fcxp_dian_submissions WHERE fcxp_id = $1 AND company_id = $2 ORDER BY attempt_number`,
    [req.params.id, req.user.companyId],
  );
  res.json(rows.map(formatSubmission));
});

router.get('/:id/submissions/:attempt/detail', requirePermission('cuentas_pagar.acceso'), async (req, res) => {
  const attempt = Number(req.params.attempt);
  if (!Number.isFinite(attempt) || attempt < 1) {
    return res.status(400).json({ error: 'Número de intento inválido' });
  }
  const fcxp = await loadFcxp(req.params.id, req.user.companyId);
  if (!fcxp) return res.status(404).json({ error: 'CxP no encontrada' });

  const { rows } = await pool.query(
    `SELECT * FROM fcxp_dian_submissions
     WHERE fcxp_id = $1 AND company_id = $2 AND attempt_number = $3`,
    [req.params.id, req.user.companyId, attempt],
  );
  const submission = rows[0];
  if (!submission) return res.status(404).json({ error: 'Envío DIAN no encontrado' });

  res.json({
    submission: formatSubmission(submission),
    validationErrors: extractDianValidationErrors(submission.response_xml),
    responseText: formatDianResponseForDisplay(submission.response_xml),
    requestXml: submission.request_xml || null,
    signedXml: submission.signed_xml || null,
    hasRequestXml: Boolean(submission.request_xml),
    hasSignedXml: Boolean(submission.signed_xml),
    hasResponseXml: Boolean(submission.response_xml),
  });
});

router.patch('/:id/void', requirePermission('cuentas_pagar.anular'), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE fcxp SET status = 'anulada', updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND status IN ('borrador', 'confirmada', 'rechazada_dian')
     RETURNING *`,
    [req.params.id, req.user.companyId],
  );
  if (!rows[0]) {
    return res.status(400).json({ error: 'No se puede anular esta CxP' });
  }
  res.json(await loadFcxp(req.params.id, req.user.companyId));
});

export default router;
