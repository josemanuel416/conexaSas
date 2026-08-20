import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { pool } from '../../db/pool.js';
import { config } from '../../config.js';
import { requirePermission } from '../../middleware/permissions.js';
import { formatClient, prepareClientPayload } from '../../utils/client-format.js';
import {
  listCompanyVariables,
  setCompanyVariable,
  peekNextServiceCode,
} from '../../utils/company-settings.js';
import { formatArticle } from '../../utils/inventory-helpers.js';
import { assessDianReadiness, formatCompanyDian, formatInvoiceEmail, assessInvoiceEmailReadiness } from '../../utils/dian-readiness.js';
import { usesDianTestSet } from '../../utils/dian-environment.js';
import {
  assessCertificateReadiness,
  assessFePosSendReadiness,
  deleteCompanyCertificate,
  encryptSecret,
  resolveSecret,
  formatCertificateInfo,
  saveCompanyCertificate,
  syncCertificateToFePos,
  syncFePosCompanyMeta,
  validateP12Certificate,
} from '../../utils/dian-certificate.js';
import { calcNitVerificationDigit, normalizeEmissorNit } from '../../utils/nit-dv.js';
import { buildInvoiceUbl } from '../../utils/ubl-invoice.js';
import { buildCreditNoteUbl } from '../../utils/ubl-credit-note.js';
import {
  assertSourceInvoiceDianNumber,
  buildFullNumber,
  resolveInvoiceDianNumber,
} from '../../utils/invoice-dian-number.js';
import {
  buildCreditNoteConceptUbl,
  formatCreditNoteConcept,
  findCreditNoteConceptByCode,
  validateCreditNoteConcept,
} from '../../utils/dian-credit-note-concepts.js';
import { buildAttachedDocumentUbl } from '../../utils/ubl-attached-document.js';
import {
  attachedDocumentFileNameFromZip,
  buildDianAttachedDocumentFileName,
  nextDianFileSequence,
  zipFileNameFromAttached,
} from '../../utils/dian-file-name.js';
import { buildInvoicePdf, buildInvoicePdfFileName } from '../../utils/invoice-pdf.js';
import { buildSalesDocumentPdf, buildSalesDocumentPdfFileName } from '../../utils/sales-document-pdf.js';
import { buildInvoiceClientEmailContent } from '../../utils/invoice-email-template.js';
import { sendInvoicePackageEmail, sendInvoiceEmailToClient } from '../../utils/invoice-email.js';
import { buildInvoiceClientPackage } from '../../utils/invoice-delivery.js';
import { parseDianApplicationResponse, extractDianValidationErrors, formatDianResponseForDisplay } from '../../utils/dian-response.js';
import { sendInvoiceToFePos, signXmlWithFePos, getFePosZipStatus, pingFePos } from '../../utils/fepos-client.js';
import { lookupDianAcquirer, validateAndEnrichClientWithDian } from '../../utils/dian-acquirer.js';
import { assertServiceNotDuplicate } from '../../utils/service-catalog.js';

const router = Router();
const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(p12|pfx)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Solo se permiten archivos .p12 o .pfx'));
  },
});

const SALES_KINDS = ['cotizacion', 'prefactura'];
const DIAN_SENT_STATUSES = ['enviada_dian', 'aprobada_dian', 'rechazada_dian'];

async function findActiveResolutionConflict(companyId, documentType, excludeId = null) {
  const values = [companyId, documentType || '01'];
  let sql = `
    SELECT id, resolution_number, prefix, document_type
    FROM dian_resolutions
    WHERE company_id = $1 AND document_type = $2 AND is_active = true
  `;
  if (excludeId) {
    values.push(excludeId);
    sql += ` AND id != $${values.length}`;
  }
  sql += ' LIMIT 1';
  const { rows } = await pool.query(sql, values);
  return rows[0] || null;
}

function activeResolutionConflictMessage(conflict) {
  const tipo = conflict.document_type === '91' ? 'nota crÃ©dito' : 'factura';
  return `Ya existe una resoluciÃ³n activa de ${tipo} (${conflict.prefix} â€” ${conflict.resolution_number}). DesactÃ­vela antes de activar otra.`;
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
    || (approved ? 'Aprobada por DIAN' : pending ? 'En validaciÃ³n por DIAN' : 'Rechazada por DIAN');
  const submissionStatus = approved ? 'aprobado' : pending ? 'enviado' : 'rechazado';
  const invoiceStatus = approved ? 'aprobada_dian' : pending ? 'enviada_dian' : 'rechazada_dian';
  return { approved, pending, statusCode, statusMessage, submissionStatus, invoiceStatus };
}

function formatService(s) {
  return {
    id: s.id,
    code: s.code,
    description: s.description,
    basePrice: Number(s.base_price),
    durationMinutes: s.duration_minutes,
    isActive: s.is_active,
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
    dianEnvironment: r.dian_environment,
    isActive: r.is_active,
    notes: r.notes,
  };
}

function formatInvoice(row, details = [], submissions = []) {
  return {
    id: row.id,
    documentKind: row.document_kind || 'factura',
    internalNumber: row.internal_number,
    sourceInvoiceId: row.source_invoice_id,
    sourceFullNumber: row.source_full_number || row.source_invoice_full_number,
    sourceInternalNumber: row.source_internal_number,
    sourceInvoicePrefix: row.source_invoice_prefix || null,
    sourceInvoiceConsecutive: row.source_invoice_consecutive != null
      ? Number(row.source_invoice_consecutive)
      : null,
    sourceInvoiceFullNumber: row.source_invoice_full_number || null,
    dianResolutionId: row.dian_resolution_id,
    resolutionNumber: row.resolution_number,
    prefix: row.prefix,
    consecutiveNumber: row.consecutive_number != null ? Number(row.consecutive_number) : null,
    fullNumber: row.full_number || row.internal_number,
    clientId: row.client_id,
    clientName: row.client_first ? `${row.client_first} ${row.client_last}` : undefined,
    clientDocument: row.client_document,
    issueDate: row.issue_date,
    issueTime: String(row.issue_time).slice(0, 8),
    dueDate: row.due_date,
    currency: row.currency,
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discount_amount),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    status: row.status,
    cufe: row.cufe,
    notes: row.notes,
    creditNoteConceptCode: row.credit_note_concept_code || null,
    creditNoteScope: row.credit_note_scope || null,
    creditNoteConceptName: row.credit_note_concept_name || null,
    creditNoteSequence: row.credit_note_sequence != null ? Number(row.credit_note_sequence) : null,
    createdBy: row.created_by || null,
    details,
    submissions,
    createdAt: row.created_at,
  };
}

function formatDetail(d) {
  return {
    id: d.id,
    lineNumber: d.line_number,
    serviceId: d.service_id,
    itemCode: d.item_code,
    description: d.description,
    quantity: Number(d.quantity),
    unitPrice: Number(d.unit_price),
    discountAmount: Number(d.discount_amount),
    taxRate: Number(d.tax_rate),
    taxAmount: Number(d.tax_amount),
    lineTotal: Number(d.line_total),
  };
}

function formatSubmission(s) {
  return {
    id: s.id,
    invoiceId: s.invoice_id,
    invoiceNumber: s.full_number || s.internal_number,
    invoiceKind: s.document_kind,
    clientName: s.client_first ? `${s.client_first} ${s.client_last}` : undefined,
    attemptNumber: s.attempt_number,
    dianEnvironment: s.dian_environment,
    zipFileName: s.zip_file_name,
    attachedDocumentFileName: s.attached_document_file_name || undefined,
    clientPackageZipName: zipFileNameFromAttached(s.attached_document_file_name) || undefined,
    hasSignedXml: Boolean(s.signed_xml),
    hasResponseXml: Boolean(s.response_xml),
    cufe: s.uuid || undefined,
    status: s.status,
    statusCode: s.status_code,
    statusMessage: s.status_message,
    trackId: s.track_id,
    uuid: s.uuid,
    isSuccess: s.is_success,
    sentAt: s.sent_at,
    respondedAt: s.responded_at,
    createdAt: s.created_at,
  };
}

async function resolveAttachedDocumentFileName(submission, companyRow, companyDian, invoice) {
  if (submission.attached_document_file_name) {
    return submission.attached_document_file_name;
  }

  let fileName = attachedDocumentFileNameFromZip(submission.zip_file_name);
  if (!fileName) {
    const issueYear = invoice.issueDate
      ? new Date(invoice.issueDate).getFullYear()
      : new Date().getFullYear();
    const sequence = await nextDianFileSequence(pool, companyRow.id, 'ad', issueYear);
    fileName = buildDianAttachedDocumentFileName({
      nit: companyDian.nit,
      assignmentCode: companyRow.dian_assignment_code || '000',
      year: issueYear,
      sequence,
    });
  }

  await pool.query(
    `UPDATE dian_submissions SET attached_document_file_name = $1 WHERE id = $2`,
    [fileName, submission.id]
  );
  return fileName;
}

function calcLine(quantity, unitPrice, discountAmount, taxRate) {
  const qty = Number(quantity) || 1;
  const price = Number(unitPrice) || 0;
  const discount = Number(discountAmount) || 0;
  const rate = Number(taxRate) || 0;
  const base = Math.max(0, qty * price - discount);
  const taxAmount = Math.round(base * (rate / 100) * 100) / 100;
  const lineTotal = Math.round((base + taxAmount) * 100) / 100;
  return { base, taxAmount, lineTotal };
}


async function stampIssueDateTime(db, invoiceId) {
  await db.query(
    `UPDATE invoices SET
       issue_date = (NOW() AT TIME ZONE 'America/Bogota')::date,
       issue_time = (NOW() AT TIME ZONE 'America/Bogota')::time
     WHERE id = $1`,
    [invoiceId]
  );
}

async function loadCompanyEmailRow(companyId) {
  const { rows } = await pool.query(
    `SELECT id, name, nit, email, address, phone, logo_path,
            invoice_email_from, invoice_email_from_name,
            invoice_smtp_host, invoice_smtp_port, invoice_smtp_user,
            invoice_smtp_password, invoice_smtp_secure
     FROM companies WHERE id = $1`,
    [companyId],
  );
  return rows[0] || null;
}

async function loadSalesDocumentContext(documentId, companyId, printedByUserId = null) {
  const document = await loadInvoice(documentId, companyId);
  if (!document || !SALES_KINDS.includes(document.documentKind)) {
    return null;
  }
  const { rows: companyRows } = await pool.query(
    `SELECT name, nit, address, phone, logo_path,
            theme_primary, theme_secondary, theme_accent
     FROM companies WHERE id = $1`,
    [companyId],
  );
  const { rows: clientRows } = await pool.query(
    `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
    [document.clientId, companyId],
  );
  const userIds = [...new Set([document.createdBy, printedByUserId].filter(Boolean))];
  let usersById = {};
  if (userIds.length) {
    const { rows: userRows } = await pool.query(
      `SELECT id, email, full_name FROM users WHERE id = ANY($1::uuid[])`,
      [userIds],
    );
    usersById = Object.fromEntries(userRows.map((u) => [u.id, u]));
  }
  const companyRow = companyRows[0] || {};
  return {
    document,
    company: {
      ...companyRow,
      logoPath: companyRow.logo_path,
      themePrimary: companyRow.theme_primary,
      themeSecondary: companyRow.theme_secondary,
      themeAccent: companyRow.theme_accent,
    },
    client: clientRows[0] ? formatClient(clientRows[0]) : null,
    preparedBy: usersById[document.createdBy] || null,
    printedBy: usersById[printedByUserId] || usersById[document.createdBy] || null,
  };
}

const INTERNAL_NUMBER_PREFIX = {
  cotizacion: 'COT',
  prefactura: 'PRE',
  nota_credito: 'NC',
};

async function nextInternalNumber(client, companyId, kind) {
  const prefix = INTERNAL_NUMBER_PREFIX[kind];
  if (!prefix) {
    throw Object.assign(new Error('Tipo de documento sin numeración interna'), { status: 400 });
  }
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(
       NULLIF(regexp_replace(internal_number, '^${prefix}-', ''), internal_number)::INTEGER
     ), 0) + 1 AS next
     FROM invoices
     WHERE company_id = $1 AND document_kind = $2`,
    [companyId, kind]
  );
  return `${prefix}-${String(rows[0].next).padStart(6, '0')}`;
}

async function nextCreditNoteSequence(client, sourceInvoiceId, companyId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(credit_note_sequence), 0) + 1 AS next
     FROM invoices
     WHERE source_invoice_id = $1 AND company_id = $2 AND document_kind = 'nota_credito'`,
    [sourceInvoiceId, companyId]
  );
  return Number(rows[0].next);
}

async function listCreditNotesForSource(client, sourceInvoiceId, companyId) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT id, full_number, internal_number, credit_note_sequence, total, status,
            credit_note_concept_code, credit_note_scope, created_at
     FROM invoices
     WHERE source_invoice_id = $1 AND company_id = $2 AND document_kind = 'nota_credito'
     ORDER BY COALESCE(credit_note_sequence, 999999), created_at`,
    [sourceInvoiceId, companyId]
  );
  return rows;
}

function sumApprovedCreditNoteTotal(creditNotes) {
  return creditNotes
    .filter((row) => ['aprobada_dian', 'enviada_dian'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.total || 0), 0);
}

function findApprovedTotalVoidCreditNote(creditNotes) {
  return creditNotes.find(
    (row) =>
      row.status === 'aprobada_dian'
      && row.credit_note_concept_code === '2'
      && row.credit_note_scope === 'total'
  ) || null;
}

async function assertCreditNoteCreationAllowed(client, {
  sourceInvoice,
  companyId,
  conceptCode,
  scope,
  lines,
  excludeCreditNoteId = null,
}) {
  if (sourceInvoice.status === 'anulada') {
    throw Object.assign(new Error('La factura origen ya está anulada'), { status: 400 });
  }

  assertSourceInvoiceDianNumber(sourceInvoice);

  let existingNotes = await listCreditNotesForSource(client, sourceInvoice.id, companyId);
  if (excludeCreditNoteId) {
    existingNotes = existingNotes.filter((row) => row.id !== excludeCreditNoteId);
  }
  if (findApprovedTotalVoidCreditNote(existingNotes)) {
    throw Object.assign(
      new Error('La factura ya tiene una nota crédito de anulación total aprobada por DIAN'),
      { status: 400 }
    );
  }

  const concept = await getCreditNoteConcept(conceptCode);
  if (!concept) {
    throw Object.assign(new Error('Concepto de nota crédito DIAN no válido'), { status: 400 });
  }

  const { effectiveScope } = validateCreditNoteConcept({
    conceptCode: concept.code,
    scope,
    sourceInvoice,
    lines,
  });

  const { total: newTotal } = await computeLines(client, companyId, lines);
  const sourceTotal = Number(sourceInvoice.total) || 0;
  const creditedTotal = sumApprovedCreditNoteTotal(existingNotes);
  const reservedTotal = existingNotes
    .filter((row) => !['rechazada_dian', 'borrador'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.total || 0), 0);
  const remaining = Math.max(0, sourceTotal - reservedTotal);

  if (effectiveScope === 'total') {
    const hasApprovedPartial = existingNotes.some(
      (row) =>
        ['aprobada_dian', 'enviada_dian'].includes(row.status)
        && !(row.credit_note_concept_code === '2' && row.credit_note_scope === 'total')
    );
    if (hasApprovedPartial) {
      throw Object.assign(
        new Error(
          `La factura ya tiene notas crédito parciales por ${creditedTotal.toFixed(2)}. `
          + 'No puede emitir una NC total adicional sobre el mismo documento.'
        ),
        { status: 400 }
      );
    }
  } else if (reservedTotal + newTotal > sourceTotal + 0.02) {
    throw Object.assign(
      new Error(
        `El acumulado de notas crédito (${(reservedTotal + newTotal).toFixed(2)}) `
        + `supera el total de la factura (${sourceTotal.toFixed(2)}). Saldo disponible: ${remaining.toFixed(2)}.`
      ),
      { status: 400 }
    );
  }

  return {
    concept,
    effectiveScope,
    existingNotes,
    creditedTotal,
    remaining,
    nextSequence: await nextCreditNoteSequence(client, sourceInvoice.id, companyId),
  };
}

async function computeLines(client, companyId, lines) {
  let subtotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;
  let total = 0;
  const computedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let itemCode = line.itemCode;
    let description = line.description;
    let unitPrice = line.unitPrice;

    if (line.serviceId) {
      const { rows: svc } = await client.query(
        `SELECT code, description, base_price FROM services
         WHERE id = $1 AND company_id = $2 AND is_active = true`,
        [line.serviceId, companyId]
      );
      if (!svc[0]) {
        throw Object.assign(new Error(`Servicio inválido en línea ${i + 1}`), { status: 400 });
      }
      itemCode = itemCode || svc[0].code;
      description = description || svc[0].description;
      unitPrice = unitPrice ?? Number(svc[0].base_price);
    } else if (line.articleId) {
      const { rows: art } = await client.query(
        `SELECT code, name FROM inventory_articles
         WHERE id = $1 AND company_id = $2 AND is_active = true`,
        [line.articleId, companyId],
      );
      if (!art[0]) {
        throw Object.assign(new Error(`Artículo inválido en línea ${i + 1}`), { status: 400 });
      }
      itemCode = itemCode || art[0].code;
      description = description || art[0].name;
    }

    if (!itemCode || !description) {
      throw Object.assign(new Error(`Línea ${i + 1}: código y descripción requeridos`), { status: 400 });
    }

    const calc = calcLine(line.quantity, unitPrice, line.discountAmount, line.taxRate ?? 19);
    subtotal += calc.base;
    discountAmount += Number(line.discountAmount) || 0;
    taxAmount += calc.taxAmount;
    total += calc.lineTotal;

    computedLines.push({
      lineNumber: i + 1,
      serviceId: line.serviceId || null,
      itemCode,
      description,
      quantity: line.quantity || 1,
      unitPrice,
      discountAmount: line.discountAmount || 0,
      taxRate: line.taxRate ?? 19,
      taxAmount: calc.taxAmount,
      lineTotal: calc.lineTotal,
    });
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
    computedLines,
  };
}

const INVOICE_SELECT = `
  SELECT i.*, dr.resolution_number,
         c.first_name AS client_first, c.last_name AS client_last,
         c.document_number AS client_document,
         src.full_number AS source_full_number,
         src.internal_number AS source_internal_number,
         cnc.name AS credit_note_concept_name
  FROM invoices i
  LEFT JOIN dian_resolutions dr ON dr.id = i.dian_resolution_id
  JOIN clients c ON c.id = i.client_id
  LEFT JOIN invoices src ON src.id = i.source_invoice_id
  LEFT JOIN dian_credit_note_concepts cnc ON cnc.code = i.credit_note_concept_code
`;

async function loadInvoice(id, companyId) {
  const { rows } = await pool.query(
    `${INVOICE_SELECT} WHERE i.id = $1 AND i.company_id = $2`,
    [id, companyId]
  );
  if (!rows[0]) return null;

  const { rows: details } = await pool.query(
    `SELECT * FROM invoice_details WHERE invoice_id = $1 ORDER BY line_number`,
    [id]
  );
  const { rows: submissions } = await pool.query(
    `SELECT id, invoice_id, attempt_number, dian_environment, zip_file_name, status,
            status_code, status_message, track_id, uuid, is_success, sent_at, responded_at, created_at
     FROM dian_submissions WHERE invoice_id = $1 ORDER BY attempt_number DESC`,
    [id]
  );

  return formatInvoice(rows[0], details.map(formatDetail), submissions.map(formatSubmission));
}

async function findCreditNoteForSource(sourceInvoiceId, companyId) {
  const { rows } = await pool.query(
    `SELECT id FROM invoices
     WHERE source_invoice_id = $1 AND company_id = $2 AND document_kind = 'nota_credito'
     ORDER BY COALESCE(credit_note_sequence, 0) DESC, created_at DESC LIMIT 1`,
    [sourceInvoiceId, companyId]
  );
  if (!rows[0]) return null;
  return loadInvoice(rows[0].id, companyId);
}

async function findRetryableVoidCreditNote(client, sourceInvoiceId, companyId) {
  const { rows } = await client.query(
    `SELECT id FROM invoices
     WHERE source_invoice_id = $1 AND company_id = $2 AND document_kind = 'nota_credito'
       AND credit_note_concept_code = '2' AND credit_note_scope = 'total'
       AND status IN ('rechazada_dian', 'emitida')
     ORDER BY created_at DESC LIMIT 1`,
    [sourceInvoiceId, companyId]
  );
  if (!rows[0]) return null;
  return loadInvoice(rows[0].id, companyId);
}

async function getSourceInvoiceResolution(client, sourceInvoice, companyId) {
  if (!sourceInvoice.dianResolutionId) {
    throw Object.assign(new Error('La factura origen no tiene resolución DIAN'), { status: 400 });
  }
  const { rows } = await client.query(
    `SELECT * FROM dian_resolutions
     WHERE id = $1 AND company_id = $2 AND is_active = true`,
    [sourceInvoice.dianResolutionId, companyId]
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error('La resolución DIAN de la factura origen no está activa'),
      { status: 400 }
    );
  }
  return rows[0];
}

async function lockSourceInvoiceResolution(client, sourceInvoice, companyId) {
  if (!sourceInvoice.dianResolutionId) {
    throw Object.assign(new Error('La factura origen no tiene resolución DIAN'), { status: 400 });
  }
  const { rows } = await client.query(
    `SELECT * FROM dian_resolutions
     WHERE id = $1 AND company_id = $2 AND is_active = true
     FOR UPDATE`,
    [sourceInvoice.dianResolutionId, companyId]
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error('La resolución DIAN de la factura origen no está activa'),
      { status: 400 }
    );
  }
  return rows[0];
}

async function getCreditNoteConcept(code) {
  const { rows } = await pool.query(
    `SELECT * FROM dian_credit_note_concepts WHERE code = $1 AND is_active = true`,
    [String(code)]
  );
  if (rows[0]) return formatCreditNoteConcept(rows[0]);
  return findCreditNoteConceptByCode(code);
}

async function createCreditNoteFromSource(client, {
  sourceInvoice,
  companyId,
  userId,
  notes,
  lines,
  emit = true,
  conceptCode = '2',
  scope,
}) {
  const resolution = await lockSourceInvoiceResolution(client, sourceInvoice, companyId);

  const lineInput = lines || sourceInvoice.details.map((d) => ({
    serviceId: d.serviceId,
    itemCode: d.itemCode,
    description: d.description,
    quantity: d.quantity,
    unitPrice: d.unitPrice,
    discountAmount: d.discountAmount,
    taxRate: d.taxRate,
  }));

  const {
    concept,
    effectiveScope,
    nextSequence,
  } = await assertCreditNoteCreationAllowed(client, {
    sourceInvoice,
    companyId,
    conceptCode,
    scope,
    lines: lineInput,
  });

  const { subtotal, discountAmount, taxAmount, total, computedLines } =
    await computeLines(client, companyId, lineInput);

  const sourceDian = assertSourceInvoiceDianNumber(sourceInvoice);
  const internalNumber = await nextInternalNumber(client, companyId, 'nota_credito');
  const nextConsecutive = Number(resolution.current_consecutive) + 1;
  if (nextConsecutive > Number(resolution.range_to)) {
    throw Object.assign(new Error('La resolución DIAN agotó el rango de numeración'), { status: 400 });
  }
  const dianFullNumber = buildFullNumber(resolution.prefix, nextConsecutive);
  const status = emit ? 'emitida' : 'borrador';

  const { rows: invRows } = await client.query(
    `INSERT INTO invoices (
       company_id, document_kind, source_invoice_id, dian_resolution_id, client_id,
       internal_number, credit_note_sequence,
       source_invoice_prefix, source_invoice_consecutive, source_invoice_full_number,
       prefix, consecutive_number, full_number,
       subtotal, discount_amount, tax_amount, total, status, notes,
       credit_note_concept_code, credit_note_scope, created_by
     ) VALUES ($1,'nota_credito',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [
      companyId, sourceInvoice.id, resolution.id, sourceInvoice.clientId,
      internalNumber, nextSequence,
      sourceDian.prefix, sourceDian.consecutive, sourceDian.fullNumber,
      resolution.prefix, nextConsecutive, dianFullNumber,
      subtotal, discountAmount, taxAmount, total, status,
      notes || concept.name,
      concept.code, effectiveScope,
      userId,
    ]
  );

  await client.query(
    `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
    [nextConsecutive, resolution.id]
  );

  if (status === 'emitida') {
    await stampIssueDateTime(client, invRows[0].id);
  }

  for (const line of computedLines) {
    await client.query(
      `INSERT INTO invoice_details (
         invoice_id, line_number, service_id, item_code, description, quantity,
         unit_price, discount_amount, tax_rate, tax_amount, line_total
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        invRows[0].id, line.lineNumber, line.serviceId, line.itemCode, line.description,
        line.quantity, line.unitPrice, line.discountAmount, line.taxRate, line.taxAmount, line.lineTotal,
      ]
    );
  }

  return invRows[0].id;
}

async function updateCreditNoteFromSource(client, {
  creditNote,
  sourceInvoice,
  companyId,
  notes,
  lines,
  conceptCode,
  scope,
}) {
  const {
    concept,
    effectiveScope,
  } = await assertCreditNoteCreationAllowed(client, {
    sourceInvoice,
    companyId,
    conceptCode,
    scope,
    lines,
    excludeCreditNoteId: creditNote.id,
  });

  const { subtotal, discountAmount, taxAmount, total, computedLines } =
    await computeLines(client, companyId, lines);

  const newStatus = creditNote.status === 'borrador' ? 'borrador' : 'emitida';

  await client.query(
    `UPDATE invoices SET
       subtotal = $1, discount_amount = $2, tax_amount = $3, total = $4,
       notes = $5, credit_note_concept_code = $6, credit_note_scope = $7,
       status = $8, updated_at = NOW()
     WHERE id = $9 AND company_id = $10`,
    [
      subtotal, discountAmount, taxAmount, total,
      notes || concept.name,
      concept.code, effectiveScope, newStatus,
      creditNote.id, companyId,
    ]
  );

  await client.query(`DELETE FROM invoice_details WHERE invoice_id = $1`, [creditNote.id]);

  for (const line of computedLines) {
    await client.query(
      `INSERT INTO invoice_details (
         invoice_id, line_number, service_id, item_code, description, quantity,
         unit_price, discount_amount, tax_rate, tax_amount, line_total
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        creditNote.id, line.lineNumber, line.serviceId, line.itemCode, line.description,
        line.quantity, line.unitPrice, line.discountAmount, line.taxRate, line.taxAmount, line.lineTotal,
      ]
    );
  }

  if (newStatus === 'emitida' && creditNote.status !== 'emitida') {
    await stampIssueDateTime(client, creditNote.id);
  }

  return creditNote.id;
}

async function ensureCreditNoteDianNumber(client, creditNote, companyId) {
  const existing = resolveInvoiceDianNumber(creditNote);
  if (existing?.prefix && existing.consecutive != null && existing.fullNumber
    && !/^NC-/i.test(existing.fullNumber)) {
    return existing;
  }

  if (!creditNote.dianResolutionId) {
    throw Object.assign(new Error('La nota crédito no tiene resolución DIAN'), { status: 400 });
  }

  const { rows } = await client.query(
    `SELECT * FROM dian_resolutions
     WHERE id = $1 AND company_id = $2 AND is_active = true
     FOR UPDATE`,
    [creditNote.dianResolutionId, companyId]
  );
  const resolution = rows[0];
  if (!resolution) {
    throw Object.assign(new Error('La resolución DIAN no está activa'), { status: 400 });
  }

  const nextConsecutive = Number(resolution.current_consecutive) + 1;
  if (nextConsecutive > Number(resolution.range_to)) {
    throw Object.assign(new Error('La resolución DIAN agotó el rango de numeración'), { status: 400 });
  }

  const dianFullNumber = buildFullNumber(resolution.prefix, nextConsecutive);

  await client.query(
    `UPDATE invoices SET prefix = $1, consecutive_number = $2, full_number = $3, updated_at = NOW()
     WHERE id = $4 AND company_id = $5`,
    [resolution.prefix, nextConsecutive, dianFullNumber, creditNote.id, companyId]
  );

  await client.query(
    `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
    [nextConsecutive, resolution.id]
  );

  return {
    prefix: resolution.prefix,
    consecutive: nextConsecutive,
    fullNumber: dianFullNumber,
  };
}

function resolveSourceCufe(invoice) {
  if (invoice.cufe) return invoice.cufe;
  const approved = invoice.submissions?.find((s) => s.isSuccess && s.uuid);
  return approved?.uuid || '';
}

async function processDianSend(invoiceId, companyId, userId) {
  const invoice = await loadInvoice(invoiceId, companyId);
  if (!invoice) {
    return { httpStatus: 404, body: { error: 'Documento no encontrado' } };
  }
  if (!['factura', 'nota_credito'].includes(invoice.documentKind)) {
    return { httpStatus: 400, body: { error: 'Solo facturas y notas crÃ©dito se envÃ­an a DIAN' } };
  }
  if (!['emitida', 'rechazada_dian'].includes(invoice.status)) {
    return { httpStatus: 400, body: { error: 'Solo se pueden enviar documentos emitidos o rechazados previamente' } };
  }

  const { rows: prev } = await pool.query(
    `SELECT COUNT(*) AS count FROM dian_submissions WHERE invoice_id = $1`,
    [invoiceId]
  );
  const attempt = Number(prev[0].count) + 1;

  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1`,
    [invoice.dianResolutionId]
  );
  const resolution = resolutionRows[0] ? formatResolution(resolutionRows[0]) : null;
  if (!resolution) {
    return { httpStatus: 400, body: { error: 'El documento no tiene resoluciÃ³n DIAN asociada' } };
  }

  const { rows: companyRows } = await pool.query(
    `SELECT ${COMPANY_DIAN_SELECT} FROM companies WHERE id = $1`,
    [companyId]
  );
  if (!companyRows[0]) {
    return { httpStatus: 404, body: { error: 'CompaÃ±Ã­a no encontrada' } };
  }

  const { rows: allResolutions } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE company_id = $1`,
    [companyId]
  );
  const companyDian = formatCompanyDian(companyRows[0]);
  const certificate = formatCertificateInfo(
    companyRows[0],
    companyRows[0].nit,
    companyRows[0].verification_digit
  );
  const dianReadiness = assessDianReadiness({
    company: companyDian,
    resolutions: allResolutions.map(formatResolution),
  });
  const certificateReadiness = assessCertificateReadiness(
    certificate,
    companyRows[0].nit,
    companyRows[0].verification_digit
  );
  const fePosReadiness = assessFePosSendReadiness({ fePosUrl: config.fePosUrl });
  const sendMissing = [
    ...dianReadiness.missing,
    ...certificateReadiness.missing,
    ...fePosReadiness.missing,
  ];
  if (sendMissing.length) {
    return {
      httpStatus: 400,
      body: {
        error: 'Faltan datos para enviar a DIAN',
        missing: sendMissing,
        warnings: [
          ...dianReadiness.warnings,
          ...certificateReadiness.warnings,
          ...fePosReadiness.warnings,
        ],
      },
    };
  }

  if (!invoice.issueDate) {
    return { httpStatus: 400, body: { error: 'El documento no tiene fecha de emisiÃ³n' } };
  }
  if (!invoice.details?.length) {
    return { httpStatus: 400, body: { error: 'El documento no tiene lÃ­neas de detalle' } };
  }
  if (!resolution.technicalKey) {
    return { httpStatus: 400, body: { error: 'La resoluciÃ³n DIAN no tiene clave tÃ©cnica' } };
  }

  await stampIssueDateTime(pool, invoiceId);
  const refreshed = await loadInvoice(invoiceId, companyId);
  if (refreshed) {
    Object.assign(invoice, {
      issueDate: refreshed.issueDate,
      issueTime: refreshed.issueTime,
    });
  }

  const { rows: clientRows } = await pool.query(
    `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
    [invoice.clientId, companyId]
  );
  if (!clientRows[0]) {
    return { httpStatus: 400, body: { error: 'Cliente del documento no encontrado' } };
  }
  const client = formatClient(clientRows[0]);

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

  const companyForUbl = {
    ...companyDian,
    dianSoftwareId: companyRows[0].dian_software_id,
  };

  const softwarePin = resolveSecret(companyRows[0].dian_software_pin) || '';
  if (!softwarePin) {
    return { httpStatus: 400, body: { error: 'Configure la clave del software (PIN DIAN) del emisor' } };
  }

  let requestXml;
  try {
    if (invoice.documentKind === 'nota_credito') {
      if (!invoice.sourceInvoiceId) {
        return { httpStatus: 400, body: { error: 'La nota crÃ©dito no tiene factura origen' } };
      }
      const sourceInvoice = await loadInvoice(invoice.sourceInvoiceId, companyId);
      if (!sourceInvoice) {
        return { httpStatus: 400, body: { error: 'Factura origen no encontrada' } };
      }
      const sourceCufe = resolveSourceCufe(sourceInvoice);
      if (!sourceCufe) {
        return { httpStatus: 400, body: { error: 'La factura origen no tiene CUFE. Debe estar aprobada por DIAN.' } };
      }
      try {
        assertSourceInvoiceDianNumber(sourceInvoice);
      } catch (err) {
        return { httpStatus: err.status || 400, body: { error: err.message } };
      }

      const assignClient = await pool.connect();
      try {
        await assignClient.query('BEGIN');
        const dianNum = await ensureCreditNoteDianNumber(assignClient, invoice, companyId);
        await assignClient.query('COMMIT');
        Object.assign(invoice, {
          prefix: dianNum.prefix,
          consecutiveNumber: dianNum.consecutive,
          fullNumber: dianNum.fullNumber,
        });
      } catch (err) {
        await assignClient.query('ROLLBACK');
        return { httpStatus: err.status || 400, body: { error: err.message } };
      } finally {
        assignClient.release();
      }

      const { rows: sourceResolutionRows } = await pool.query(
        `SELECT * FROM dian_resolutions WHERE id = $1`,
        [sourceInvoice.dianResolutionId]
      );
      const sourceResolution = sourceResolutionRows[0]
        ? formatResolution(sourceResolutionRows[0])
        : resolution;

      const concept = await getCreditNoteConcept(invoice.creditNoteConceptCode || '2');
      if (!concept) {
        return { httpStatus: 400, body: { error: 'La nota crédito no tiene concepto DIAN válido' } };
      }
      const sourceRef = resolveInvoiceDianNumber(sourceInvoice);
      const conceptUbl = buildCreditNoteConceptUbl(concept, invoice.creditNoteScope || 'total', {
        sourceNumber: sourceRef?.fullNumber || sourceInvoice.fullNumber,
        notes: invoice.notes,
      });
      requestXml = buildCreditNoteUbl({
        creditNote: invoice,
        sourceInvoice: { ...sourceInvoice, cufe: sourceCufe },
        company: companyForUbl,
        client,
        resolution: sourceResolution,
        lines: invoice.details,
        conceptUbl,
      });
    } else {
      requestXml = buildInvoiceUbl({
        invoice,
        company: companyForUbl,
        client,
        resolution,
        lines: invoice.details,
      });
    }
  } catch (err) {
    console.error('[send-dian] UBL', err);
    return { httpStatus: 500, body: { error: `No se pudo generar XML UBL: ${err.message}` } };
  }

  const { rows: pendingRows } = await pool.query(
    `INSERT INTO dian_submissions (
       company_id, invoice_id, attempt_number, dian_environment, status,
       request_xml, sent_at, created_by
     ) VALUES ($1,$2,$3,$4,'pendiente',$5,NOW(),$6) RETURNING *`,
    [companyId, invoiceId, attempt, resolution.dianEnvironment, requestXml, userId]
  );

  const fePosPing = await pingFePos();
  if (!fePosPing.ok) {
    const pingMsg = `ServerFEpos no estÃ¡ disponible (${fePosPing.error}). ${fePosPing.hint || 'Inicie el servicio en el puerto 3010.'}`;
    const { rows: errorRows } = await pool.query(
      `UPDATE dian_submissions SET status = 'error', status_code = '503', status_message = $1,
       is_success = false, responded_at = NOW() WHERE id = $2 RETURNING *`,
      [pingMsg, pendingRows[0].id]
    );
    return { httpStatus: 503, body: { error: pingMsg, submission: formatSubmission(errorRows[0]) } };
  }

  let fePosResult;
  try {
    fePosResult = await sendInvoiceToFePos({
      companyId,
      technicalKey: resolution.technicalKey,
      softwarePin,
      softwareId: companyDian.dianSoftwareId || '',
      dianEnvironment: resolution.dianEnvironment || '',
      testSetId: usesDianTestSet(resolution.dianEnvironment)
        ? (companyRows[0].dian_test_set_id || '')
        : '',
      xml: requestXml,
    });
  } catch (err) {
    console.error('[send-dian] ServerFEpos', err);
    const { rows: errorRows } = await pool.query(
      `UPDATE dian_submissions SET status = 'error', status_code = $1, status_message = $2,
       is_success = false, responded_at = NOW() WHERE id = $3 RETURNING *`,
      [String(err.status || '502'), err.message, pendingRows[0].id]
    );
    await pool.query(
      `UPDATE invoices SET status = 'rechazada_dian', updated_at = NOW() WHERE id = $1`,
      [invoiceId]
    );
    return {
      httpStatus: err.status === 400 ? 400 : 502,
      body: { error: err.message, submission: formatSubmission(errorRows[0]) },
    };
  }

  const {
    approved,
    pending,
    statusCode,
    statusMessage,
    submissionStatus,
    invoiceStatus,
  } = resolveSubmissionFromFePos(fePosResult);

  const { rows: finalRows } = await pool.query(
    `UPDATE dian_submissions SET
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
      fePosResult.responseXml
        || (fePosResult.archivo_respuesta ? `archivo:${fePosResult.archivo_respuesta}` : JSON.stringify(fePosResult)),
      fePosResult.zipFileName || null,
      fePosResult.zipKey || null,
      fePosResult.cufe || null,
      approved,
      pendingRows[0].id,
    ]
  );

  await pool.query(
    `UPDATE invoices SET status = $1, cufe = COALESCE($2, cufe), updated_at = NOW() WHERE id = $3`,
    [invoiceStatus, fePosResult.cufe || null, invoiceId]
  );

  if (
    approved
    && invoice.documentKind === 'nota_credito'
    && invoice.creditNoteConceptCode === '2'
    && invoice.sourceInvoiceId
  ) {
    await pool.query(
      `UPDATE invoices SET status = 'anulada', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND document_kind = 'factura'`,
      [invoice.sourceInvoiceId, companyId]
    );
  }

  const docLabel = invoice.documentKind === 'nota_credito' ? 'Nota crédito' : 'Factura';
  const responseMessage = approved
    ? `${docLabel} enviada y aprobada por DIAN`
    : pending
      ? `${docLabel} en cola de validaciÃ³n DIAN. Puede actualizar el estado en unos minutos.`
      : `${docLabel} enviada pero rechazada por DIAN`;

  return {
    httpStatus: approved ? 200 : pending ? 202 : 422,
    body: {
      message: responseMessage,
      fePos: fePosResult,
      submission: formatSubmission(finalRows[0]),
      invoiceId,
      approved,
      pending,
    },
  };
}

// --- CatÃ¡logo compartido ---
router.get('/clients/dian-lookup', requirePermission('ventas.clientes'), async (req, res) => {
  try {
    const { documentType, documentNumber } = req.query;
    const lookup = await lookupDianAcquirer(
      req.user.companyId,
      documentType,
      documentNumber,
    );
    res.json({
      found: lookup.found,
      statusCode: lookup.statusCode,
      message: lookup.message,
      receiverName: lookup.receiverName,
      receiverEmail: lookup.receiverEmail,
      suggested: lookup.suggested,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.message,
        missing: err.missing,
        hint: err.hint,
      });
    }
    throw err;
  }
});

router.get('/clients', requirePermission('ventas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM clients WHERE company_id = $1 ORDER BY first_name, last_name`,
    [req.user.companyId]
  );
  res.json(rows.map(formatClient));
});

router.post('/clients', requirePermission('ventas.clientes'), async (req, res) => {
  try {
    const p = prepareClientPayload(req.body);
    const dianResult = await validateAndEnrichClientWithDian(req.user.companyId, p);
    const { rows } = await pool.query(
      `INSERT INTO clients (
         company_id, document_type, document_number, verification_digit,
         person_type, tax_level_code, business_name,
         first_name, middle_name, last_name, phone, email, address,
         city_code, city_name, department_code, department_name, country_code
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        req.user.companyId, p.documentType, p.documentNumber, p.verificationDigit,
        p.personType, p.taxLevelCode, p.businessName,
        p.firstName, p.middleName, p.lastName, p.phone, p.email, p.address,
        p.cityCode, p.cityName, p.departmentCode, p.departmentName, p.countryCode,
      ]
    );
    res.status(201).json({
      ...formatClient(rows[0]),
      dianValidation: dianResult,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') return res.status(409).json({ error: 'Documento ya registrado' });
    throw err;
  }
});

router.put('/clients/:id', requirePermission('ventas.clientes'), async (req, res) => {
  try {
    const p = prepareClientPayload({ ...req.body, isActive: req.body.isActive });
    const dianResult = await validateAndEnrichClientWithDian(req.user.companyId, p);
    const { rows } = await pool.query(
      `UPDATE clients SET
         document_type = $1,
         document_number = $2,
         verification_digit = $3,
         person_type = $4,
         tax_level_code = $5,
         business_name = $6,
         first_name = $7,
         middle_name = $8,
         last_name = $9,
         phone = $10,
         email = $11,
         address = $12,
         city_code = $13,
         city_name = $14,
         department_code = $15,
         department_name = $16,
         country_code = $17,
         is_active = COALESCE($18, is_active),
         updated_at = NOW()
       WHERE id = $19 AND company_id = $20 RETURNING *`,
      [
        p.documentType, p.documentNumber, p.verificationDigit,
        p.personType, p.taxLevelCode, p.businessName,
        p.firstName, p.middleName, p.lastName, p.phone, p.email, p.address,
        p.cityCode, p.cityName, p.departmentCode, p.departmentName, p.countryCode,
        req.body.isActive, req.params.id, req.user.companyId,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({
      ...formatClient(rows[0]),
      dianValidation: dianResult,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.get('/settings', requirePermission('ventas.acceso'), async (req, res) => {
  res.json(await listCompanyVariables(pool, req.user.companyId));
});

router.get('/services/next-code', requirePermission('ventas.acceso'), async (req, res) => {
  try {
    res.json(await peekNextServiceCode(pool, req.user.companyId));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.put('/settings/:key', requirePermission('ventas.variables'), async (req, res) => {
  try {
    res.json(await setCompanyVariable(pool, req.user.companyId, req.params.key, req.body.value));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.get('/services', requirePermission('ventas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM services WHERE company_id = $1 ORDER BY code`,
    [req.user.companyId]
  );
  res.json(rows.map(formatService));
});

router.get('/catalog/articles', requirePermission('ventas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.*, t.name AS article_type_name
     FROM inventory_articles a
     LEFT JOIN inventory_article_types t ON t.id = a.article_type_id
     WHERE a.company_id = $1 AND a.is_active = true
     ORDER BY a.code`,
    [req.user.companyId],
  );
  res.json(rows.map(formatArticle));
});

router.post('/services', requirePermission('ventas.servicios'), async (req, res) => {
  const { code, description, basePrice, durationMinutes } = req.body;
  const desc = String(description || '').trim();
  if (!desc) return res.status(400).json({ error: 'Descripción requerida' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertServiceNotDuplicate(client, req.user.companyId, desc);
    const serviceCode = code?.trim() || (await peekNextServiceCode(client, req.user.companyId)).nextCode;
    const { rows } = await client.query(
      `INSERT INTO services (company_id, code, description, base_price, duration_minutes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.companyId, serviceCode, desc, basePrice, durationMinutes || 30]
    );
    await client.query('COMMIT');
    res.status(201).json(formatService(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'CÃ³digo ya registrado' });
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.put('/services/:id', requirePermission('ventas.servicios'), async (req, res) => {
  const desc = req.body.description != null ? String(req.body.description).trim() : null;
  if (desc) {
    try {
      await assertServiceNotDuplicate(pool, req.user.companyId, desc, req.params.id);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  }
  const { rows } = await pool.query(
    `UPDATE services SET
       description = COALESCE($1, description),
       base_price = COALESCE($2, base_price),
       duration_minutes = COALESCE($3, duration_minutes),
       is_active = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE id = $5 AND company_id = $6 RETURNING *`,
    [
      req.body.description,
      req.body.basePrice,
      req.body.durationMinutes,
      req.body.isActive,
      req.params.id,
      req.user.companyId,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Servicio no encontrado' });
  res.json(formatService(rows[0]));
});

router.get('/resolutions', requirePermission('ventas.acceso'), async (req, res) => {
  const { documentType } = req.query;
  const values = [req.user.companyId];
  let sql = `SELECT * FROM dian_resolutions WHERE company_id = $1`;
  if (documentType) {
    values.push(documentType);
    sql += ` AND document_type = $${values.length}`;
  }
  sql += ' ORDER BY valid_from DESC';
  const { rows } = await pool.query(sql, values);
  res.json(rows.map(formatResolution));
});

const COMPANY_CERT_SELECT = `dian_cert_subject_cn, dian_cert_subject_nit, dian_cert_subject_dv, dian_cert_valid_from, dian_cert_valid_to,
  dian_cert_fingerprint, dian_cert_storage_key, dian_cert_password_enc, dian_cert_uploaded_at, dian_cert_synced_fepos_at`;

const COMPANY_DIAN_SELECT = `id, name, nit, email, address, verification_digit, dian_software_id, dian_software_pin, dian_test_set_id,
  invoice_email_from, invoice_email_from_name, invoice_smtp_host, invoice_smtp_port,
  invoice_smtp_secure, invoice_smtp_user, invoice_smtp_password,
  ${COMPANY_CERT_SELECT}`;

async function buildDianConfigPayload(companyRow, resolutionRows) {
  const company = formatCompanyDian(companyRow);
  const invoiceEmail = formatInvoiceEmail(companyRow);
  const resolutions = resolutionRows.map(formatResolution);
  const certificate = formatCertificateInfo(
    companyRow,
    companyRow?.nit,
    companyRow?.verification_digit
  );
  const certificateReadiness = assessCertificateReadiness(
    certificate,
    companyRow?.nit,
    companyRow?.verification_digit
  );
  const fePosReadiness = assessFePosSendReadiness({ fePosUrl: config.fePosUrl });
  const dianReadiness = assessDianReadiness({ company, resolutions });

  const sendMissing = [
    ...dianReadiness.missing,
    ...certificateReadiness.missing,
    ...fePosReadiness.missing,
  ];
  const sendWarnings = [
    ...dianReadiness.warnings,
    ...certificateReadiness.warnings,
    ...fePosReadiness.warnings,
  ];

  return {
    company,
    invoiceEmail,
    certificate,
    invoiceEmailReadiness: assessInvoiceEmailReadiness(invoiceEmail),
    readiness: dianReadiness,
    certificateReadiness,
    fePosReadiness,
    sendReadiness: {
      ready: sendMissing.length === 0,
      missing: sendMissing,
      warnings: sendWarnings,
    },
  };
}

router.get('/dian-config', requirePermission('ventas.acceso'), async (req, res) => {
  const { rows: companyRows } = await pool.query(
    `SELECT ${COMPANY_DIAN_SELECT} FROM companies WHERE id = $1`,
    [req.user.companyId]
  );
  let company = formatCompanyDian(companyRows[0]);
  if (companyRows[0] && company?.verificationDigit && !companyRows[0].verification_digit) {
    await pool.query(
      `UPDATE companies SET verification_digit = $1, updated_at = NOW() WHERE id = $2`,
      [company.verificationDigit, req.user.companyId]
    );
  }
  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE company_id = $1 ORDER BY valid_from DESC`,
    [req.user.companyId]
  );
  res.json(await buildDianConfigPayload(companyRows[0], resolutionRows));
});

router.put('/dian-config', requirePermission('ventas.acceso', 'ventas.resoluciones'), async (req, res) => {
  try {
  const {
    dianSoftwareId,
    dianSoftwarePin,
    dianTestSetId,
    contactEmail,
    invoiceFromEmail,
    invoiceFromName,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword,
  } = req.body;

  const { rows: currentRows } = await pool.query(
    `SELECT nit, invoice_smtp_password, dian_software_pin FROM companies WHERE id = $1`,
    [req.user.companyId]
  );
  if (!currentRows[0]) return res.status(404).json({ error: 'CompaÃ±Ã­a no encontrada' });

  const computedDv = calcNitVerificationDigit(currentRows[0].nit);
  const verificationDigit = computedDv != null ? String(computedDv) : null;
  const nextPassword = smtpPassword?.trim()
    ? smtpPassword.trim()
    : currentRows[0].invoice_smtp_password;
  const nextSoftwarePin = dianSoftwarePin?.trim()
    ? encryptSecret(dianSoftwarePin.trim())
    : currentRows[0].dian_software_pin;
  const pinUpdated = Boolean(dianSoftwarePin?.trim());

  const { rows } = await pool.query(
    `UPDATE companies SET
       verification_digit = $1,
       email = COALESCE($2, email),
       dian_software_id = COALESCE($3, dian_software_id),
       dian_software_pin = $4,
       dian_test_set_id = COALESCE($5, dian_test_set_id),
       invoice_email_from = COALESCE($6, invoice_email_from),
       invoice_email_from_name = COALESCE($7, invoice_email_from_name),
       invoice_smtp_host = COALESCE($8, invoice_smtp_host),
       invoice_smtp_port = COALESCE($9, invoice_smtp_port),
       invoice_smtp_secure = COALESCE($10, invoice_smtp_secure),
       invoice_smtp_user = COALESCE($11, invoice_smtp_user),
       invoice_smtp_password = $12,
       updated_at = NOW()
     WHERE id = $13
     RETURNING ${COMPANY_DIAN_SELECT}`,
    [
      verificationDigit,
      contactEmail?.trim() || null,
      dianSoftwareId?.trim() || null,
      nextSoftwarePin,
      dianTestSetId?.trim() || null,
      invoiceFromEmail?.trim() || null,
      invoiceFromName?.trim() || null,
      smtpHost?.trim() || null,
      smtpPort != null ? Number(smtpPort) : null,
      smtpSecure != null ? Boolean(smtpSecure) : null,
      smtpUser?.trim() || null,
      nextPassword,
      req.user.companyId,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: 'CompaÃ±Ã­a no encontrada' });

  const company = formatCompanyDian(rows[0]);
  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE company_id = $1`,
    [req.user.companyId]
  );
  const payload = await buildDianConfigPayload(rows[0], resolutionRows);
  res.json({ ...payload, pinUpdated, pinSaved: company.pinDecryptOk });
  } catch (err) {
    console.error('[dian-config PUT]', err);
    res.status(500).json({ error: err.message || 'No se pudo guardar la configuraciÃ³n DIAN' });
  }
});

router.get('/dian-certificate', requirePermission('ventas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT nit, verification_digit, ${COMPANY_CERT_SELECT} FROM companies WHERE id = $1`,
    [req.user.companyId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'CompaÃ±Ã­a no encontrada' });
  const certificate = formatCertificateInfo(rows[0], rows[0].nit, rows[0].verification_digit);
  res.json({
    certificate,
    certificateReadiness: assessCertificateReadiness(
      certificate,
      rows[0].nit,
      rows[0].verification_digit
    ),
  });
});

router.post(
  '/dian-certificate',
  requirePermission('ventas.acceso', 'ventas.resoluciones'),
  certUpload.single('certificate'),
  async (req, res) => {
    try {
      const password = req.body?.password?.trim();
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Seleccione un archivo .p12 o .pfx' });
      }

      const { rows: currentRows } = await pool.query(
        `SELECT nit, verification_digit, dian_cert_storage_key FROM companies WHERE id = $1`,
        [req.user.companyId]
      );
      if (!currentRows[0]) return res.status(404).json({ error: 'CompaÃ±Ã­a no encontrada' });

      const meta = validateP12Certificate(req.file.buffer, password);
      const companyNit = normalizeEmissorNit(currentRows[0].nit, currentRows[0].verification_digit);
      const certNit = meta.subjectNit || '';
      if (companyNit && certNit && companyNit !== certNit) {
        return res.status(400).json({
          error: `El certificado pertenece al NIT ${certNit}, pero el emisor es ${companyNit}`,
        });
      }
      if (!meta.isValid) {
        return res.status(400).json({ error: 'El certificado no estÃ¡ vigente' });
      }

      if (currentRows[0].dian_cert_storage_key) {
        deleteCompanyCertificate(currentRows[0].dian_cert_storage_key);
      }

      const storageKey = saveCompanyCertificate(req.user.companyId, req.file.buffer);

      const { rows: companyMetaRows } = await pool.query(
        `SELECT nit, dian_software_id FROM companies WHERE id = $1`,
        [req.user.companyId]
      );
      const sync = syncCertificateToFePos(req.user.companyId, req.file.buffer, password, {
        softwareId: companyMetaRows[0]?.dian_software_id || '',
        nit: companyMetaRows[0]?.nit || '',
      });
      const passwordEnc = encryptSecret(password);

      const { rows } = await pool.query(
        `UPDATE companies SET
           dian_cert_subject_cn = $1,
           dian_cert_subject_nit = $2,
           dian_cert_subject_dv = $3,
           dian_cert_valid_from = $4,
           dian_cert_valid_to = $5,
           dian_cert_fingerprint = $6,
           dian_cert_storage_key = $7,
           dian_cert_password_enc = $8,
           dian_cert_uploaded_at = NOW(),
           dian_cert_synced_fepos_at = CASE WHEN $9 THEN NOW() ELSE NULL END,
           updated_at = NOW()
         WHERE id = $10
         RETURNING ${COMPANY_DIAN_SELECT}`,
        [
          meta.subjectCn,
          meta.subjectNit || null,
          meta.subjectDv || null,
          meta.validFrom,
          meta.validTo,
          meta.fingerprint,
          storageKey,
          passwordEnc,
          sync.synced,
          req.user.companyId,
        ]
      );

      const { rows: resolutionRows } = await pool.query(
        `SELECT * FROM dian_resolutions WHERE company_id = $1`,
        [req.user.companyId]
      );

      res.json({
        message: sync.synced
          ? 'Certificado guardado y sincronizado con ServerFEpos'
          : 'Certificado guardado (revise FEPOS_CERT_ROOT para sincronizar)',
        sync,
        ...(await buildDianConfigPayload(rows[0], resolutionRows)),
      });
    } catch (err) {
      console.error('[dian-certificate POST]', err);
      res.status(400).json({ error: err.message || 'No se pudo registrar el certificado' });
    }
  }
);

router.delete('/dian-certificate', requirePermission('ventas.acceso', 'ventas.resoluciones'), async (req, res) => {
  try {
    const { rows: currentRows } = await pool.query(
      `SELECT dian_cert_storage_key FROM companies WHERE id = $1`,
      [req.user.companyId]
    );
    if (!currentRows[0]) return res.status(404).json({ error: 'CompaÃ±Ã­a no encontrada' });

    deleteCompanyCertificate(currentRows[0].dian_cert_storage_key);

    const fePosDir = path.join(config.fePosCertRoot, String(req.user.companyId));
    if (fs.existsSync(fePosDir)) {
      fs.rmSync(fePosDir, { recursive: true, force: true });
    }

    const { rows } = await pool.query(
      `UPDATE companies SET
         dian_cert_subject_cn = NULL,
         dian_cert_subject_nit = NULL,
         dian_cert_subject_dv = NULL,
         dian_cert_valid_from = NULL,
         dian_cert_valid_to = NULL,
         dian_cert_fingerprint = NULL,
         dian_cert_storage_key = NULL,
         dian_cert_password_enc = NULL,
         dian_cert_uploaded_at = NULL,
         dian_cert_synced_fepos_at = NULL,
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${COMPANY_DIAN_SELECT}`,
      [req.user.companyId]
    );

    const { rows: resolutionRows } = await pool.query(
      `SELECT * FROM dian_resolutions WHERE company_id = $1`,
      [req.user.companyId]
    );

    res.json({
      message: 'Certificado eliminado',
      ...(await buildDianConfigPayload(rows[0], resolutionRows)),
    });
  } catch (err) {
    console.error('[dian-certificate DELETE]', err);
    res.status(500).json({ error: err.message || 'No se pudo eliminar el certificado' });
  }
});

router.post('/resolutions', requirePermission('ventas.resoluciones'), async (req, res) => {
  const {
    resolutionNumber, prefix, rangeFrom, rangeTo, resolutionDate, validFrom, validTo,
    technicalKey, documentType, dianEnvironment, notes,
  } = req.body;

  if (!resolutionNumber || !prefix || !rangeFrom || !rangeTo || !resolutionDate || !validFrom || !validTo) {
    return res.status(400).json({ error: 'Complete los datos de la resoluciÃ³n DIAN (incluya fecha de expediciÃ³n)' });
  }

  if (usesDianTestSet(dianEnvironment)) {
    const { rows: co } = await pool.query(
      `SELECT dian_test_set_id FROM companies WHERE id = $1`,
      [req.user.companyId]
    );
    if (!co[0]?.dian_test_set_id) {
      return res.status(400).json({
        error: 'Configure el cÃ³digo Set de pruebas DIAN antes de guardar una resoluciÃ³n en habilitaciÃ³n',
      });
    }
  }

  const docType = documentType || '01';
  const willBeActive = req.body.isActive !== false;
  if (willBeActive) {
    const conflict = await findActiveResolutionConflict(req.user.companyId, docType);
    if (conflict) {
      return res.status(409).json({ error: activeResolutionConflictMessage(conflict) });
    }
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO dian_resolutions (
         company_id, resolution_number, prefix, range_from, range_to, current_consecutive,
         resolution_date, valid_from, valid_to, technical_key, document_type, dian_environment, is_active, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        req.user.companyId, resolutionNumber, prefix.toUpperCase(), rangeFrom, rangeTo,
        Number(rangeFrom) - 1, resolutionDate, validFrom, validTo, technicalKey || null,
        docType, dianEnvironment || 'habilitacion', willBeActive, notes || null,
      ]
    );
    res.status(201).json(formatResolution(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ResoluciÃ³n o prefijo ya registrado' });
    throw err;
  }
});

router.put('/resolutions/:id', requirePermission('ventas.resoluciones'), async (req, res) => {
  const { rows: existingRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1 AND company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'ResoluciÃ³n no encontrada' });

  const env = req.body.dianEnvironment || existing.dian_environment;
  if (usesDianTestSet(env)) {
    const { rows: co } = await pool.query(
      `SELECT dian_test_set_id FROM companies WHERE id = $1`,
      [req.user.companyId]
    );
    if (!co[0]?.dian_test_set_id) {
      return res.status(400).json({
        error: 'Configure el cÃ³digo Set de pruebas DIAN antes de usar habilitaciÃ³n',
      });
    }
  }

  const docType = req.body.documentType || existing.document_type;
  const willBeActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : existing.is_active;
  if (willBeActive) {
    const conflict = await findActiveResolutionConflict(req.user.companyId, docType, req.params.id);
    if (conflict) {
      return res.status(409).json({ error: activeResolutionConflictMessage(conflict) });
    }
  }

  const { rows } = await pool.query(
    `UPDATE dian_resolutions SET
       resolution_number = COALESCE($1, resolution_number),
       prefix = COALESCE($2, prefix),
       range_from = COALESCE($3, range_from),
       range_to = COALESCE($4, range_to),
       resolution_date = COALESCE($5, resolution_date),
       valid_from = COALESCE($6, valid_from),
       valid_to = COALESCE($7, valid_to),
       technical_key = COALESCE($8, technical_key),
       document_type = COALESCE($9, document_type),
       dian_environment = COALESCE($10, dian_environment),
       is_active = COALESCE($11, is_active),
       notes = COALESCE($12, notes),
       updated_at = NOW()
     WHERE id = $13 AND company_id = $14 RETURNING *`,
    [
      req.body.resolutionNumber, req.body.prefix?.toUpperCase(), req.body.rangeFrom, req.body.rangeTo,
      req.body.resolutionDate, req.body.validFrom, req.body.validTo, req.body.technicalKey,
      req.body.documentType, req.body.dianEnvironment, req.body.isActive, req.body.notes,
      req.params.id, req.user.companyId,
    ]
  );
  res.json(formatResolution(rows[0]));
});

// --- Cotizaciones / Prefacturas ---
router.get('/documents', requirePermission('ventas.acceso'), async (req, res) => {
  const { kind, status } = req.query;
  if (!SALES_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'kind debe ser cotizacion o prefactura' });
  }

  const values = [req.user.companyId, kind];
  let sql = `${INVOICE_SELECT} WHERE i.company_id = $1 AND i.document_kind = $2`;

  if (status) {
    values.push(status);
    sql += ` AND i.status = $${values.length}`;
  }
  sql += ' ORDER BY i.issue_date DESC, i.created_at DESC LIMIT 200';

  const { rows } = await pool.query(sql, values);
  res.json(rows.map((r) => formatInvoice(r)));
});

router.get('/documents/:id', requirePermission('ventas.acceso'), async (req, res) => {
  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice || !SALES_KINDS.includes(invoice.documentKind)) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  res.json(invoice);
});

router.patch('/documents/:id/confirm', requirePermission('ventas.cotizar'), async (req, res) => {
  const document = await loadInvoice(req.params.id, req.user.companyId);
  if (!document || document.documentKind !== 'cotizacion') {
    return res.status(404).json({ error: 'Cotización no encontrada' });
  }
  if (document.status === 'convertida') {
    return res.status(400).json({ error: 'Esta cotización ya fue facturada' });
  }
  if (document.status === 'anulada') {
    return res.status(400).json({ error: 'Cotización anulada' });
  }
  if (document.status !== 'borrador') {
    return res.status(400).json({ error: 'La cotización ya está confirmada' });
  }

  await stampIssueDateTime(pool, req.params.id);
  await pool.query(
    `UPDATE invoices SET status = 'emitida', updated_at = NOW() WHERE id = $1 AND company_id = $2`,
    [req.params.id, req.user.companyId],
  );
  res.json(await loadInvoice(req.params.id, req.user.companyId));
});

router.get('/documents/:id/pdf', requirePermission('ventas.acceso'), async (req, res) => {
  const ctx = await loadSalesDocumentContext(req.params.id, req.user.companyId, req.user.userId);
  if (!ctx) return res.status(404).json({ error: 'Documento no encontrado' });

  try {
    const pdfBuffer = await buildSalesDocumentPdf({
      company: ctx.company,
      document: ctx.document,
      client: ctx.client,
      preparedBy: ctx.preparedBy,
      printedBy: ctx.printedBy,
    });
    const fileName = buildSalesDocumentPdfFileName(ctx.document);
    const forceDownload = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Download-Filename', fileName);
    res.setHeader(
      'Content-Disposition',
      `${forceDownload ? 'attachment' : 'inline'}; filename="${fileName}"`,
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[sales-document-pdf]', err);
    return res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
  }
});

router.post('/documents/:id/send-to-client', requirePermission('ventas.cotizar'), async (req, res) => {
  const ctx = await loadSalesDocumentContext(req.params.id, req.user.companyId, req.user.userId);
  if (!ctx) return res.status(404).json({ error: 'Cotización no encontrada' });
  if (ctx.document.documentKind !== 'cotizacion') {
    return res.status(400).json({ error: 'Solo se pueden enviar cotizaciones al cliente' });
  }
  if (ctx.document.status === 'convertida') {
    return res.status(400).json({ error: 'Esta cotización ya fue facturada' });
  }
  if (ctx.document.status !== 'emitida') {
    return res.status(400).json({ error: 'Confirme la cotización antes de enviarla al cliente' });
  }

  const companyRow = await loadCompanyEmailRow(req.user.companyId);
  if (!companyRow) return res.status(404).json({ error: 'Compañía no encontrada' });

  const recipient = req.body?.email?.trim() || ctx.client?.email;
  if (!recipient) {
    return res.status(400).json({ error: 'El cliente no tiene correo. Indique un email de destino.' });
  }

  try {
    const pdfBuffer = await buildSalesDocumentPdf({
      company: ctx.company,
      document: ctx.document,
      client: ctx.client,
      preparedBy: ctx.preparedBy,
      printedBy: ctx.printedBy,
    });
    const pdfFileName = buildSalesDocumentPdfFileName(ctx.document);
    const docNumber = ctx.document.internalNumber || ctx.document.id;
    const emailSubject = req.body?.subject?.trim()
      || `Cotización ${docNumber} — ${companyRow.name || 'Conexa'}`;
    const { html, text, logoAttachment } = buildInvoiceClientEmailContent({
      companyRow,
      invoiceNumber: docNumber,
      documentKind: ctx.document.documentKind,
      clientName: ctx.client?.fullName || ctx.document.clientName,
    });
    const attachments = [{ filename: pdfFileName, content: pdfBuffer }];
    if (logoAttachment) attachments.unshift(logoAttachment);

    await sendInvoicePackageEmail({
      companyRow,
      toEmail: recipient,
      subject: emailSubject,
      text,
      html,
      attachments,
    });

    res.json({
      ok: true,
      message: 'Cotización enviada al cliente',
      to: recipient,
      pdfFileName,
    });
  } catch (err) {
    console.error('[cotizacion-send-to-client]', err);
    return res.status(err.status || 500).json({ error: err.message || 'No se pudo enviar la cotización' });
  }
});

router.post('/documents', requirePermission('ventas.cotizar'), async (req, res) => {
  const { kind, clientId, dueDate, notes, lines, emit } = req.body;

  if (!SALES_KINDS.includes(kind)) {
    return res.status(400).json({ error: 'kind debe ser cotizacion o prefactura' });
  }
  if (!clientId || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Cliente y al menos un Ã­tem son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: clientRows } = await client.query(
      `SELECT id FROM clients WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [clientId, req.user.companyId]
    );
    if (!clientRows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cliente no vÃ¡lido' });
    }

    const { subtotal, discountAmount, taxAmount, total, computedLines } =
      await computeLines(client, req.user.companyId, lines);

    const internalNumber = await nextInternalNumber(client, req.user.companyId, kind);
    const status = emit ? 'emitida' : 'borrador';

    const { rows: invRows } = await client.query(
      `INSERT INTO invoices (
         company_id, document_kind, client_id, internal_number,
         due_date, subtotal, discount_amount, tax_amount, total, status, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.user.companyId, kind, clientId, internalNumber,
        dueDate || null, subtotal, discountAmount, taxAmount, total, status, notes || null, req.user.userId,
      ]
    );

    for (const line of computedLines) {
      await client.query(
        `INSERT INTO invoice_details (
           invoice_id, line_number, service_id, item_code, description, quantity,
           unit_price, discount_amount, tax_rate, tax_amount, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          invRows[0].id, line.lineNumber, line.serviceId, line.itemCode, line.description,
          line.quantity, line.unitPrice, line.discountAmount, line.taxRate, line.taxAmount, line.lineTotal,
        ]
      );
    }

    if (status === 'emitida') {
      await stampIssueDateTime(client, invRows[0].id);
    }

    await client.query('COMMIT');
    const invoice = await loadInvoice(invRows[0].id, req.user.companyId);
    res.status(201).json(invoice);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.put('/documents/:id', requirePermission('ventas.cotizar'), async (req, res) => {
  const existing = await loadInvoice(req.params.id, req.user.companyId);
  if (!existing || !SALES_KINDS.includes(existing.documentKind)) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  if (!['borrador', 'emitida'].includes(existing.status)) {
    return res.status(400).json({ error: 'Solo se pueden editar documentos en borrador o emitidos' });
  }

  const { clientId, dueDate, notes, lines, emit } = req.body;
  if (!clientId || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Cliente y al menos un Ã­tem son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { subtotal, discountAmount, taxAmount, total, computedLines } =
      await computeLines(client, req.user.companyId, lines);

    const status = emit ? 'emitida' : existing.status === 'emitida' ? 'emitida' : 'borrador';

    await client.query(
      `UPDATE invoices SET
         client_id = $1, due_date = $2, subtotal = $3, discount_amount = $4,
         tax_amount = $5, total = $6, status = $7, notes = $8, updated_at = NOW()
       WHERE id = $9 AND company_id = $10`,
      [clientId, dueDate || null, subtotal, discountAmount, taxAmount, total, status, notes || null,
        req.params.id, req.user.companyId]
    );

    await client.query(`DELETE FROM invoice_details WHERE invoice_id = $1`, [req.params.id]);

    for (const line of computedLines) {
      await client.query(
        `INSERT INTO invoice_details (
           invoice_id, line_number, service_id, item_code, description, quantity,
           unit_price, discount_amount, tax_rate, tax_amount, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          req.params.id, line.lineNumber, line.serviceId, line.itemCode, line.description,
          line.quantity, line.unitPrice, line.discountAmount, line.taxRate, line.taxAmount, line.lineTotal,
        ]
      );
    }

    if (emit && status === 'emitida') {
      await stampIssueDateTime(client, req.params.id);
    }

    await client.query('COMMIT');
    res.json(await loadInvoice(req.params.id, req.user.companyId));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.post('/documents/:id/convert', requirePermission('ventas.facturar'), async (req, res) => {
  const source = await loadInvoice(req.params.id, req.user.companyId);
  if (!source || !SALES_KINDS.includes(source.documentKind)) {
    return res.status(404).json({ error: 'Documento no encontrado' });
  }
  if (source.status === 'convertida') {
    return res.status(400).json({ error: 'Este documento ya fue facturado' });
  }
  if (source.status === 'anulada') {
    return res.status(400).json({ error: 'Documento anulado' });
  }
  if (source.documentKind === 'cotizacion' && source.status !== 'emitida') {
    return res.status(400).json({ error: 'Confirme la cotización antes de facturar' });
  }

  const { dianResolutionId, emit } = req.body;
  if (!dianResolutionId) {
    return res.status(400).json({ error: 'Seleccione la resoluciÃ³n DIAN para facturar' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: resRows } = await client.query(
      `SELECT * FROM dian_resolutions
       WHERE id = $1 AND company_id = $2 AND is_active = true AND document_type = '01'
       FOR UPDATE`,
      [dianResolutionId, req.user.companyId]
    );
    const resolution = resRows[0];
    if (!resolution) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ResoluciÃ³n DIAN de factura no vÃ¡lida' });
    }

    const next = Number(resolution.current_consecutive) + 1;
    if (next > Number(resolution.range_to)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La resoluciÃ³n DIAN agotÃ³ el rango de numeraciÃ³n' });
    }

    const fullNumber = buildFullNumber(resolution.prefix, next);
    const status = emit !== false ? 'emitida' : 'borrador';

    const { rows: invRows } = await client.query(
      `INSERT INTO invoices (
         company_id, document_kind, source_invoice_id, dian_resolution_id, client_id,
         prefix, consecutive_number, full_number,
         due_date, subtotal, discount_amount, tax_amount, total, status, notes, created_by
       ) VALUES ($1,'factura',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        req.user.companyId, source.id, dianResolutionId, source.clientId,
        resolution.prefix, next, fullNumber,
        source.dueDate, source.subtotal, source.discountAmount, source.taxAmount, source.total,
        status, source.notes, req.user.userId,
      ]
    );

    if (status === 'emitida') {
      await stampIssueDateTime(client, invRows[0].id);
    }

    for (const line of source.details) {
      await client.query(
        `INSERT INTO invoice_details (
           invoice_id, line_number, service_id, item_code, description, quantity,
           unit_price, discount_amount, tax_rate, tax_amount, line_total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          invRows[0].id, line.lineNumber, line.serviceId, line.itemCode, line.description,
          line.quantity, line.unitPrice, line.discountAmount, line.taxRate, line.taxAmount, line.lineTotal,
        ]
      );
    }

    await client.query(
      `UPDATE dian_resolutions SET current_consecutive = $1, updated_at = NOW() WHERE id = $2`,
      [next, resolution.id]
    );

    await client.query(
      `UPDATE invoices SET status = 'convertida', updated_at = NOW() WHERE id = $1`,
      [source.id]
    );

    await client.query('COMMIT');
    const invoice = await loadInvoice(invRows[0].id, req.user.companyId);
    res.status(201).json(invoice);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// --- Facturas ---
router.get('/invoices', requirePermission('ventas.acceso'), async (req, res) => {
  const { status, from, to, kind } = req.query;
  const values = [req.user.companyId];
  let sql = `${INVOICE_SELECT} WHERE i.company_id = $1`;

  const docKind = kind || 'factura';
  values.push(docKind);
  sql += ` AND i.document_kind = $${values.length}`;

  if (status) {
    values.push(status);
    sql += ` AND i.status = $${values.length}`;
  }
  if (from) {
    values.push(from);
    sql += ` AND i.issue_date >= $${values.length}`;
  }
  if (to) {
    values.push(to);
    sql += ` AND i.issue_date <= $${values.length}`;
  }
  sql += ' ORDER BY i.issue_date DESC, i.created_at DESC LIMIT 200';

  const { rows } = await pool.query(sql, values);
  res.json(rows.map((r) => formatInvoice(r)));
});

router.get('/invoices/:id', requirePermission('ventas.acceso'), async (req, res) => {
  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  res.json(invoice);
});

router.patch('/invoices/:id/emit', requirePermission('ventas.facturar'), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE invoices SET
       status = 'emitida',
       issue_date = (NOW() AT TIME ZONE 'America/Bogota')::date,
       issue_time = (NOW() AT TIME ZONE 'America/Bogota')::time,
       updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND document_kind = 'factura' AND status = 'borrador' RETURNING id`,
    [req.params.id, req.user.companyId]
  );
  if (!rows[0]) return res.status(400).json({ error: 'Factura no encontrada o ya emitida' });
  res.json(await loadInvoice(rows[0].id, req.user.companyId));
});

router.patch('/invoices/:id/void', requirePermission('ventas.anular'), async (req, res) => {
  let invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  if (invoice.documentKind !== 'factura') {
    return res.status(400).json({ error: 'La anulaciÃ³n automÃ¡tica aplica solo a facturas' });
  }

  let existingNotes = await listCreditNotesForSource(null, invoice.id, req.user.companyId);
  const approvedTotalVoid = findApprovedTotalVoidCreditNote(existingNotes);

  if (invoice.status === 'anulada') {
    if (approvedTotalVoid) {
      const existingNc = await loadInvoice(approvedTotalVoid.id, req.user.companyId);
      return res.json({
        message: 'La factura ya fue anulada con nota crÃ©dito',
        invoice,
        creditNote: existingNc,
      });
    }
    if (!approvedTotalVoid) {
      await pool.query(
        `UPDATE invoices SET status = 'aprobada_dian', updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      invoice = await loadInvoice(req.params.id, req.user.companyId);
    }
  }

  if (invoice.status !== 'aprobada_dian') {
    return res.status(400).json({
      error: 'Solo se pueden anular facturas aprobadas por DIAN (con CUFE)',
    });
  }

  const sourceCufe = resolveSourceCufe(invoice);
  if (!sourceCufe) {
    return res.status(400).json({ error: 'La factura no tiene CUFE. Debe estar aprobada por DIAN.' });
  }

  if (approvedTotalVoid) {
    if (invoice.status !== 'anulada') {
      await pool.query(
        `UPDATE invoices SET status = 'anulada', updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
    }
    const existingNc = await loadInvoice(approvedTotalVoid.id, req.user.companyId);
    return res.json({
      message: 'La factura ya tiene nota crÃ©dito de anulaciÃ³n total aprobada',
      invoice: await loadInvoice(req.params.id, req.user.companyId),
      creditNote: existingNc,
    });
  }

  const hasApprovedPartial = existingNotes.some(
    (row) =>
      ['aprobada_dian', 'enviada_dian'].includes(row.status)
      && !(row.credit_note_concept_code === '2' && row.credit_note_scope === 'total')
  );
  if (hasApprovedPartial) {
    return res.status(400).json({
      error: 'La factura tiene notas crédito parciales. Anule el saldo restante con una NC manual, no con anulación automática.',
    });
  }

  let creditNoteId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const retryable = await findRetryableVoidCreditNote(client, invoice.id, req.user.companyId);
    if (retryable) {
      creditNoteId = retryable.id;
    } else {
      creditNoteId = await createCreditNoteFromSource(client, {
        sourceInvoice: invoice,
        companyId: req.user.companyId,
        userId: req.user.userId,
        notes: req.body?.notes || `Anulación de factura ${invoice.fullNumber}`,
        conceptCode: '2',
        scope: 'total',
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }

  const sendResult = await processDianSend(creditNoteId, req.user.companyId, req.user.userId);
  const creditNote = await loadInvoice(creditNoteId, req.user.companyId);

  if (sendResult.body.approved) {
    await pool.query(
      `UPDATE invoices SET status = 'anulada', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
  }

  const updatedInvoice = await loadInvoice(req.params.id, req.user.companyId);
  const payload = {
    ...sendResult.body,
    invoice: updatedInvoice,
    creditNote,
    message: sendResult.body.approved
      ? `Factura ${invoice.fullNumber} anulada. Nota crÃ©dito ${creditNote.fullNumber} aprobada por DIAN.`
      : sendResult.body.pending
        ? `Nota crÃ©dito ${creditNote.fullNumber} enviada. ValidaciÃ³n en proceso.`
        : sendResult.body.message || sendResult.body.error,
  };

  res.status(sendResult.httpStatus).json(payload);
});

// --- Notas crédito ---
router.get('/credit-note-concepts', requirePermission('ventas.acceso'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM dian_credit_note_concepts WHERE is_active = true ORDER BY sort_order, code`
  );
  res.json(rows.map(formatCreditNoteConcept));
});

router.get('/credit-notes', requirePermission('ventas.acceso'), async (req, res) => {
  const { rows } = await pool.query(
    `${INVOICE_SELECT}
     WHERE i.company_id = $1 AND i.document_kind = 'nota_credito'
     ORDER BY i.issue_date DESC, i.created_at DESC LIMIT 200`,
    [req.user.companyId]
  );
  res.json(rows.map((r) => formatInvoice(r)));
});

router.get('/invoices/:id/credit-notes', requirePermission('ventas.acceso'), async (req, res) => {
  const source = await loadInvoice(req.params.id, req.user.companyId);
  if (!source || source.documentKind !== 'factura') {
    return res.status(404).json({ error: 'Factura no encontrada' });
  }

  const notes = await listCreditNotesForSource(null, source.id, req.user.companyId);
  const sourceTotal = Number(source.total) || 0;
  const creditedTotal = sumApprovedCreditNoteTotal(notes);
  const reservedTotal = notes
    .filter((row) => !['rechazada_dian', 'borrador'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.total || 0), 0);

  res.json({
    sourceInvoiceId: source.id,
    sourceFullNumber: source.fullNumber,
    sourceTotal,
    creditedTotal,
    reservedTotal,
    remainingTotal: Math.max(0, sourceTotal - reservedTotal),
    hasTotalVoidCreditNote: Boolean(findApprovedTotalVoidCreditNote(notes)),
    creditNotes: await Promise.all(notes.map((row) => loadInvoice(row.id, req.user.companyId))),
  });
});

router.post('/credit-notes', requirePermission('facturacion.notas_credito'), async (req, res) => {
  const { sourceInvoiceId, notes, lines, emit, conceptCode, scope } = req.body;

  if (!sourceInvoiceId || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Factura origen y líneas son requeridos' });
  }
  if (!conceptCode) {
    return res.status(400).json({ error: 'Seleccione el concepto DIAN de la nota crédito' });
  }

  const source = await loadInvoice(sourceInvoiceId, req.user.companyId);
  if (!source || source.documentKind !== 'factura') {
    return res.status(400).json({ error: 'Factura origen no válida' });
  }
  if (!['aprobada_dian', 'emitida', 'enviada_dian'].includes(source.status)) {
    return res.status(400).json({ error: 'La factura origen debe estar emitida o aprobada por DIAN' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const creditNoteId = await createCreditNoteFromSource(client, {
      sourceInvoice: source,
      companyId: req.user.companyId,
      userId: req.user.userId,
      notes,
      lines,
      emit: emit !== false,
      conceptCode,
      scope,
    });
    await client.query('COMMIT');
    res.status(201).json(await loadInvoice(creditNoteId, req.user.companyId));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/credit-notes/:id', requirePermission('facturacion.notas_credito'), async (req, res) => {
  const { notes, lines, conceptCode, scope } = req.body;

  const creditNote = await loadInvoice(req.params.id, req.user.companyId);
  if (!creditNote || creditNote.documentKind !== 'nota_credito') {
    return res.status(404).json({ error: 'Nota crédito no encontrada' });
  }
  if (creditNote.status === 'aprobada_dian') {
    return res.status(400).json({ error: 'No se puede editar una nota crédito aprobada por DIAN' });
  }
  if (creditNote.status === 'anulada') {
    return res.status(400).json({ error: 'No se puede editar una nota crédito anulada' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Las líneas son requeridas' });
  }
  if (!conceptCode) {
    return res.status(400).json({ error: 'Seleccione el concepto DIAN de la nota crédito' });
  }

  const source = await loadInvoice(creditNote.sourceInvoiceId, req.user.companyId);
  if (!source || source.documentKind !== 'factura') {
    return res.status(400).json({ error: 'Factura origen no válida' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const creditNoteId = await updateCreditNoteFromSource(client, {
      creditNote,
      sourceInvoice: source,
      companyId: req.user.companyId,
      notes,
      lines,
      conceptCode,
      scope,
    });
    await client.query('COMMIT');
    res.json(await loadInvoice(creditNoteId, req.user.companyId));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
});

router.patch('/credit-notes/:id/void', requirePermission('facturacion.notas_credito'), async (req, res) => {
  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice || invoice.documentKind !== 'nota_credito') {
    return res.status(404).json({ error: 'Nota crédito no encontrada' });
  }
  if (invoice.status === 'anulada') {
    return res.json({ message: 'La nota crédito ya está anulada', creditNote: invoice });
  }
  if (invoice.status === 'aprobada_dian') {
    return res.status(400).json({
      error: 'No se puede anular una nota crédito aprobada por DIAN',
    });
  }

  await pool.query(
    `UPDATE invoices SET status = 'anulada', updated_at = NOW() WHERE id = $1 AND company_id = $2`,
    [req.params.id, req.user.companyId]
  );

  const creditNote = await loadInvoice(req.params.id, req.user.companyId);
  res.json({
    message: `Nota crédito ${creditNote.internalNumber || creditNote.fullNumber} anulada`,
    creditNote,
  });
});

// --- EnvÃ­o DIAN ---
router.post('/invoices/:id/send-dian', requirePermission('ventas.enviar_dian'), async (req, res) => {
  const result = await processDianSend(req.params.id, req.user.companyId, req.user.userId);
  res.status(result.httpStatus).json(result.body);
});

router.get('/invoices/:id/submissions', requirePermission('ventas.ver_dian'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ds.* FROM dian_submissions ds
     JOIN invoices i ON i.id = ds.invoice_id
     WHERE ds.invoice_id = $1 AND i.company_id = $2
     ORDER BY ds.attempt_number DESC`,
    [req.params.id, req.user.companyId]
  );
  res.json(rows.map(formatSubmission));
});

router.get('/invoices/:id/submissions/:attempt/detail', requirePermission('ventas.ver_dian'), async (req, res) => {
  const attempt = Number(req.params.attempt);
  if (!Number.isFinite(attempt) || attempt < 1) {
    return res.status(400).json({ error: 'Número de intento inválido' });
  }

  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Documento no encontrado' });

  const { rows } = await pool.query(
    `SELECT ds.* FROM dian_submissions ds
     WHERE ds.invoice_id = $1 AND ds.company_id = $2 AND ds.attempt_number = $3`,
    [req.params.id, req.user.companyId, attempt]
  );
  const submission = rows[0];
  if (!submission) return res.status(404).json({ error: 'Envío DIAN no encontrado' });

  const validationErrors = extractDianValidationErrors(submission.response_xml);
  res.json({
    submission: formatSubmission(submission),
    validationErrors,
    responseText: formatDianResponseForDisplay(submission.response_xml),
    requestXml: submission.request_xml || null,
    signedXml: submission.signed_xml || null,
    hasRequestXml: Boolean(submission.request_xml),
    hasSignedXml: Boolean(submission.signed_xml),
    hasResponseXml: Boolean(submission.response_xml),
  });
});

router.post('/invoices/:id/submissions/:attempt/refresh', requirePermission('ventas.ver_dian'), async (req, res) => {
  const attempt = Number(req.params.attempt);
  if (!Number.isFinite(attempt) || attempt < 1) {
    return res.status(400).json({ error: 'NÃºmero de intento invÃ¡lido' });
  }

  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  const { rows: submissionRows } = await pool.query(
    `SELECT ds.* FROM dian_submissions ds
     WHERE ds.invoice_id = $1 AND ds.company_id = $2 AND ds.attempt_number = $3`,
    [req.params.id, req.user.companyId, attempt]
  );
  const submission = submissionRows[0];
  if (!submission) return res.status(404).json({ error: 'EnvÃ­o DIAN no encontrado' });
  if (!submission.track_id) {
    return res.status(400).json({ error: 'Este envÃ­o no tiene ZipKey para consultar estado' });
  }
  if (submission.is_success) {
    return res.json({
      message: 'El envÃ­o ya estÃ¡ aprobado',
      submission: formatSubmission(submission),
    });
  }

  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1`,
    [invoice.dianResolutionId]
  );
  const resolution = resolutionRows[0] ? formatResolution(resolutionRows[0]) : null;
  if (!resolution?.technicalKey) {
    return res.status(400).json({ error: 'La resoluciÃ³n DIAN no tiene clave tÃ©cnica' });
  }

  const { rows: companyRows } = await pool.query(
    `SELECT ${COMPANY_DIAN_SELECT} FROM companies WHERE id = $1`,
    [req.user.companyId]
  );
  if (!companyRows[0]) return res.status(404).json({ error: 'CompaÃ±Ã­a no encontrada' });

  const softwarePin = resolveSecret(companyRows[0].dian_software_pin) || '';
  if (!softwarePin) {
    return res.status(400).json({ error: 'Configure la clave del software (PIN DIAN) del emisor' });
  }

  let fePosResult;
  try {
    fePosResult = await getFePosZipStatus({
      zipKey: submission.track_id,
      companyId: req.user.companyId,
      technicalKey: resolution.technicalKey,
      softwarePin,
      softwareId: companyRows[0].dian_software_id || '',
      dianEnvironment: submission.dian_environment || resolution.dianEnvironment || '',
    });
  } catch (err) {
    console.error('[refresh-submission]', err);
    return res.status(err.status === 400 ? 400 : 502).json({ error: err.message });
  }

  const {
    approved,
    pending,
    statusCode,
    statusMessage,
    submissionStatus,
    invoiceStatus,
  } = resolveSubmissionFromFePos(fePosResult);

  const { rows: updatedRows } = await pool.query(
    `UPDATE dian_submissions SET
       status = $1,
       status_code = $2,
       status_message = $3,
       is_success = $4,
       responded_at = NOW()
     WHERE id = $5 RETURNING *`,
    [submissionStatus, statusCode, statusMessage, approved, submission.id]
  );

  await pool.query(
    `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`,
    [invoiceStatus, req.params.id]
  );

  const responseMessage = approved
    ? 'DIAN aprobÃ³ la factura'
    : pending
      ? 'DIAN sigue procesando el lote'
      : 'DIAN rechazÃ³ la factura';

  res.status(approved ? 200 : pending ? 202 : 422).json({
    message: responseMessage,
    fePos: fePosResult,
    submission: formatSubmission(updatedRows[0]),
  });
});

router.get('/invoices/:id/attached-document', requirePermission('ventas.ver_dian'), async (req, res) => {
  const signed = req.query.signed !== 'false';
  const attempt = req.query.attempt ? Number(req.query.attempt) : null;

  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  let submissionSql = `
    SELECT ds.* FROM dian_submissions ds
    WHERE ds.invoice_id = $1 AND ds.company_id = $2 AND ds.is_success = true
  `;
  const submissionValues = [req.params.id, req.user.companyId];
  if (attempt) {
    submissionValues.push(attempt);
    submissionSql += ` AND ds.attempt_number = $${submissionValues.length}`;
  }
  submissionSql += ' ORDER BY ds.attempt_number DESC LIMIT 1';

  const { rows: submissionRows } = await pool.query(submissionSql, submissionValues);
  const submission = submissionRows[0];
  if (!submission) {
    return res.status(404).json({ error: 'No hay envÃ­o DIAN aprobado para esta factura' });
  }
  if (!submission.signed_xml || !submission.response_xml) {
    return res.status(422).json({ error: 'El envÃ­o aprobado no tiene XML firmado o respuesta DIAN guardados' });
  }

  const { rows: companyRows } = await pool.query(
    `SELECT id, name, nit, verification_digit, dian_software_id, dian_assignment_code FROM companies WHERE id = $1`,
    [req.user.companyId]
  );
  const { rows: clientRows } = await pool.query(
    `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
    [invoice.clientId, req.user.companyId]
  );
  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1 AND company_id = $2`,
    [invoice.dianResolutionId, req.user.companyId]
  );

  if (!clientRows[0] || !resolutionRows[0]) {
    return res.status(422).json({ error: 'Faltan datos de cliente o resoluciÃ³n DIAN' });
  }

  let applicationResponse;
  try {
    applicationResponse = parseDianApplicationResponse(submission.response_xml);
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  const companyDian = formatCompanyDian(companyRows[0]);
  let attachedXml;
  try {
    attachedXml = buildAttachedDocumentUbl({
      invoice,
      company: companyDian,
      client: formatClient(clientRows[0]),
      resolution: formatResolution(resolutionRows[0]),
      signedXml: submission.signed_xml,
      applicationResponse,
    });
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }

  let outputXml = attachedXml;
  if (signed) {
    if (!config.fePosUrl) {
      return res.status(503).json({ error: 'FEPOS_URL no configurada' });
    }
    try {
      const signedResult = await signXmlWithFePos({
        companyId: req.user.companyId,
        softwareId: companyRows[0].dian_software_id || '',
        dianEnvironment: submission.dian_environment || resolutionRows[0].dian_environment || 'habilitacion',
        xml: attachedXml,
        documentType: 'AttachedDocument',
      });
      outputXml = signedResult.signedXml || attachedXml;
    } catch (err) {
      console.error('[attached-document] firma', err);
      return res.status(err.status || 502).json({ error: `No se pudo firmar AttachedDocument: ${err.message}` });
    }
  }

  let fileName;
  try {
    fileName = await resolveAttachedDocumentFileName(
      submission,
      companyRows[0],
      companyDian,
      invoice
    );
  } catch (err) {
    return res.status(422).json({ error: err.message });
  }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('X-Download-Filename', fileName);
  res.send(outputXml);
});

router.get('/invoices/:id/client-package', requirePermission('ventas.ver_dian'), async (req, res) => {
  const attempt = req.query.attempt ? Number(req.query.attempt) : null;
  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  try {
    const pkg = await buildInvoiceClientPackage({
      invoice,
      companyId: req.user.companyId,
      attempt,
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${pkg.zipFileName}"`);
    res.setHeader('X-Download-Filename', pkg.zipFileName);
    return res.send(pkg.zipBuffer);
  } catch (err) {
    console.error('[client-package]', err);
    return res.status(err.status || 500).json({ error: err.message || 'No se pudo generar paquete para el cliente' });
  }
});

router.post('/invoices/:id/send-to-client', requirePermission('ventas.ver_dian'), async (req, res) => {
  const attempt = req.body?.attempt ? Number(req.body.attempt) : null;
  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  try {
    const pkg = await buildInvoiceClientPackage({
      invoice,
      companyId: req.user.companyId,
      attempt,
    });
    const emailResult = await sendInvoiceEmailToClient({
      companyRow: pkg.companyRow,
      clientEmail: pkg.clientEmail,
      clientName: pkg.client?.fullName || invoice.clientName,
      emailSubject: pkg.emailSubject,
      invoiceNumber: invoice.fullNumber || invoice.internalNumber,
      documentKind: invoice.documentKind,
      zipBuffer: pkg.zipBuffer,
      zipFileName: pkg.zipFileName,
      toEmail: req.body?.email || null,
    });
    return res.json({
      ok: true,
      message: 'Factura enviada al cliente',
      to: emailResult.to,
      zipFileName: pkg.zipFileName,
    });
  } catch (err) {
    console.error('[send-to-client]', err);
    return res.status(err.status || 500).json({ error: err.message || 'No se pudo enviar la factura al cliente' });
  }
});

router.get('/invoices/:id/pdf', requirePermission('ventas.acceso'), async (req, res) => {
  const invoice = await loadInvoice(req.params.id, req.user.companyId);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  const { rows: companyRows } = await pool.query(
    `SELECT id, name, nit, verification_digit, email, address, phone,
            theme_primary, theme_secondary, theme_accent, logo_path, invoice_template
     FROM companies WHERE id = $1`,
    [req.user.companyId]
  );
  const { rows: clientRows } = await pool.query(
    `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
    [invoice.clientId, req.user.companyId]
  );
  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1 AND company_id = $2`,
    [invoice.dianResolutionId, req.user.companyId]
  );

  if (!clientRows[0] || !resolutionRows[0]) {
    return res.status(422).json({ error: 'Faltan datos de cliente o resoluciÃ³n DIAN' });
  }

  const { rows: submissionRows } = await pool.query(
    `SELECT signed_xml FROM dian_submissions
     WHERE invoice_id = $1 AND company_id = $2 AND is_success = true
     ORDER BY attempt_number DESC LIMIT 1`,
    [req.params.id, req.user.companyId]
  );

  const companyDian = formatCompanyDian(companyRows[0]);
  let pdfBuffer;
  try {
    pdfBuffer = await buildInvoicePdf({
      invoice,
      company: {
        ...companyDian,
        phone: companyRows[0].phone || '',
        themePrimary: companyRows[0].theme_primary,
        themeSecondary: companyRows[0].theme_secondary,
        themeAccent: companyRows[0].theme_accent,
        logoPath: companyRows[0].logo_path,
        invoiceTemplate: companyRows[0].invoice_template,
      },
      client: formatClient(clientRows[0]),
      resolution: formatResolution(resolutionRows[0]),
      signedXml: submissionRows[0]?.signed_xml || null,
    });
  } catch (err) {
    console.error('[invoice-pdf]', err);
    return res.status(500).json({ error: `No se pudo generar PDF: ${err.message}` });
  }

  const fileName = buildInvoicePdfFileName(invoice);
  const forceDownload = req.query.download === '1' || req.query.download === 'true';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${forceDownload ? 'attachment' : 'inline'}; filename="${fileName}"`
  );
  res.send(pdfBuffer);
});

router.get('/dian-submissions', requirePermission('facturacion.seguimiento_dian'), async (req, res) => {
  const { status, from, to } = req.query;
  const values = [req.user.companyId];
  let sql = `
    SELECT ds.*, i.full_number, i.internal_number, i.document_kind,
           c.first_name AS client_first, c.last_name AS client_last
    FROM dian_submissions ds
    JOIN invoices i ON i.id = ds.invoice_id
    JOIN clients c ON c.id = i.client_id
    WHERE ds.company_id = $1`;

  if (status) {
    values.push(status);
    sql += ` AND ds.status = $${values.length}`;
  }
  if (from) {
    values.push(from);
    sql += ` AND ds.created_at >= $${values.length}::date`;
  }
  if (to) {
    values.push(to);
    sql += ` AND ds.created_at < ($${values.length}::date + INTERVAL '1 day')`;
  }
  sql += ' ORDER BY ds.created_at DESC LIMIT 300';

  const { rows } = await pool.query(sql, values);
  res.json(rows.map(formatSubmission));
});

export default router;
