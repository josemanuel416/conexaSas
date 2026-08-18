import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { buildAttachedDocumentUbl } from './ubl-attached-document.js';
import { parseDianApplicationResponse } from './dian-response.js';
import {
  buildDianAttachedDocumentFileName,
  attachedDocumentFileNameFromZip,
  zipFileNameFromAttached,
  buildClientEmailSubject,
  nextDianFileSequence,
} from './dian-file-name.js';
import { formatCompanyDian } from './dian-readiness.js';
import { formatClient } from './client-format.js';
import { signXmlWithFePos } from './fepos-client.js';
import { buildInvoicePdf, buildInvoicePdfFileName } from './invoice-pdf.js';
import { createZipBuffer } from './zip-buffer.js';

function formatResolution(row) {
  if (!row) return null;
  return {
    resolutionNumber: row.resolution_number,
    resolutionDate: row.resolution_date,
    prefix: row.prefix,
    rangeFrom: row.range_from,
    rangeTo: row.range_to,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    dianEnvironment: row.dian_environment,
    technicalKey: row.technical_key,
  };
}

async function loadApprovedSubmission(invoiceId, companyId, attempt) {
  let submissionSql = `
    SELECT ds.* FROM dian_submissions ds
    WHERE ds.invoice_id = $1 AND ds.company_id = $2 AND ds.is_success = true
  `;
  const submissionValues = [invoiceId, companyId];
  if (attempt) {
    submissionValues.push(attempt);
    submissionSql += ` AND ds.attempt_number = $${submissionValues.length}`;
  }
  submissionSql += ' ORDER BY ds.attempt_number DESC LIMIT 1';

  const { rows } = await pool.query(submissionSql, submissionValues);
  return rows[0] || null;
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

/**
 * @param {{
 *   invoice: object,
 *   companyId: string,
 *   attempt?: number | null,
 * }} params
 */
export async function buildInvoiceClientPackage({ invoice, companyId, attempt = null }) {
  const submission = await loadApprovedSubmission(invoice.id, companyId, attempt);
  if (!submission) {
    throw Object.assign(new Error('No hay envío DIAN aprobado para esta factura'), { status: 404 });
  }
  if (!submission.signed_xml || !submission.response_xml) {
    throw Object.assign(
      new Error('El envío aprobado no tiene XML firmado o respuesta DIAN guardados'),
      { status: 422 }
    );
  }

  const { rows: companyRows } = await pool.query(
    `SELECT id, name, nit, verification_digit, email, address, phone,
            theme_primary, theme_secondary, theme_accent, logo_path, invoice_template,
            dian_software_id, dian_assignment_code,
            invoice_email_from, invoice_email_from_name,
            invoice_smtp_host, invoice_smtp_port, invoice_smtp_secure,
            invoice_smtp_user, invoice_smtp_password
     FROM companies WHERE id = $1`,
    [companyId]
  );
  const { rows: clientRows } = await pool.query(
    `SELECT * FROM clients WHERE id = $1 AND company_id = $2`,
    [invoice.clientId, companyId]
  );
  const { rows: resolutionRows } = await pool.query(
    `SELECT * FROM dian_resolutions WHERE id = $1 AND company_id = $2`,
    [invoice.dianResolutionId, companyId]
  );

  if (!companyRows[0] || !clientRows[0] || !resolutionRows[0]) {
    throw Object.assign(new Error('Faltan datos de compañía, cliente o resolución DIAN'), { status: 422 });
  }

  const companyRow = companyRows[0];
  const companyDian = formatCompanyDian(companyRow);
  const client = formatClient(clientRows[0]);
  const resolution = formatResolution(resolutionRows[0]);

  let applicationResponse;
  try {
    applicationResponse = parseDianApplicationResponse(submission.response_xml);
  } catch (err) {
    throw Object.assign(new Error(err.message), { status: 422 });
  }

  const attachedXml = buildAttachedDocumentUbl({
    invoice,
    company: companyDian,
    client,
    resolution,
    signedXml: submission.signed_xml,
    applicationResponse,
  });

  if (!config.fePosUrl) {
    throw Object.assign(new Error('FEPOS_URL no configurada'), { status: 503 });
  }

  let signedAttachedXml;
  try {
    const signedResult = await signXmlWithFePos({
      companyId,
      softwareId: companyRow.dian_software_id || '',
      dianEnvironment: submission.dian_environment || resolution.dianEnvironment || 'habilitacion',
      xml: attachedXml,
      documentType: 'AttachedDocument',
    });
    signedAttachedXml = signedResult.signedXml || attachedXml;
  } catch (err) {
    throw Object.assign(
      new Error(`No se pudo firmar AttachedDocument: ${err.message}`),
      { status: err.status || 502 }
    );
  }

  const adFileName = await resolveAttachedDocumentFileName(
    submission,
    companyRow,
    companyDian,
    invoice
  );
  const zipFileName = zipFileNameFromAttached(adFileName)
    || `${adFileName.replace(/\.xml$/i, '')}.zip`;

  const pdfBuffer = await buildInvoicePdf({
    invoice,
    company: {
      ...companyDian,
      phone: companyRow.phone || '',
      themePrimary: companyRow.theme_primary,
      themeSecondary: companyRow.theme_secondary,
      themeAccent: companyRow.theme_accent,
      logoPath: companyRow.logo_path,
      invoiceTemplate: companyRow.invoice_template,
    },
    client,
    resolution,
    signedXml: submission.signed_xml,
  });
  const pdfFileName = buildInvoicePdfFileName(invoice);

  const zipBuffer = await createZipBuffer([
    { name: adFileName, data: Buffer.from(signedAttachedXml, 'utf8') },
    { name: pdfFileName, data: pdfBuffer },
  ]);

  const emailSubject = buildClientEmailSubject({
    companyNit: companyDian.nit,
    companyName: companyRow.name,
    invoiceNumber: invoice.fullNumber || invoice.internalNumber,
  });

  return {
    companyRow,
    client,
    submission,
    adFileName,
    zipFileName,
    pdfFileName,
    zipBuffer,
    signedAttachedXml,
    pdfBuffer,
    emailSubject,
    clientEmail: client.email || '',
  };
}
