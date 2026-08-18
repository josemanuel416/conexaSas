import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { pingFePos, lookupAcquirerFePos } from './fepos-client.js';
import { normalizeDianDocumentType } from './nit-dv.js';
import {
  assessCertificateReadiness,
  formatCertificateInfo,
  resolveSecret,
} from './dian-certificate.js';
import { formatCompanyDian } from './dian-readiness.js';

const COMPANY_LOOKUP_SELECT = `id, nit, verification_digit, dian_software_id, dian_software_pin, dian_test_set_id,
  dian_cert_subject_cn, dian_cert_subject_nit, dian_cert_subject_dv, dian_cert_valid_from, dian_cert_valid_to,
  dian_cert_fingerprint, dian_cert_storage_key, dian_cert_password_enc, dian_cert_uploaded_at, dian_cert_synced_fepos_at`;

export async function loadCompanyLookupContext(companyId) {
  const { rows } = await pool.query(
    `SELECT ${COMPANY_LOOKUP_SELECT} FROM companies WHERE id = $1`,
    [companyId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Compañía no encontrada'), { status: 404 });
  }

  const { rows: resolutionRows } = await pool.query(
    `SELECT dian_environment FROM dian_resolutions
     WHERE company_id = $1 AND is_active = true
     ORDER BY valid_from DESC LIMIT 1`,
    [companyId],
  );

  const company = formatCompanyDian(rows[0]);
  const certificate = formatCertificateInfo(rows[0], rows[0].nit, rows[0].verification_digit);
  const certificateReadiness = assessCertificateReadiness(
    certificate,
    rows[0].nit,
    rows[0].verification_digit,
  );

  return {
    companyRow: rows[0],
    company,
    certificate,
    certificateReadiness,
    dianEnvironment: config.dianAcquirerEnv || resolutionRows[0]?.dian_environment || 'produccion',
  };
}

export function parseReceiverName(receiverName, documentType) {
  const name = String(receiverName || '').trim();
  const docType = normalizeDianDocumentType(documentType);

  if (!name) {
    return { personType: docType === '31' ? 'juridica' : 'natural' };
  }

  if (docType === '31') {
    return { personType: 'juridica', businessName: name };
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { personType: 'natural', firstName: parts[0], lastName: '.' };
  }
  if (parts.length === 2) {
    return { personType: 'natural', firstName: parts[0], lastName: parts[1] };
  }

  return {
    personType: 'natural',
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function mapAcquirerToClientFields(documentType, acquirer) {
  const parsed = parseReceiverName(acquirer.receiverName, documentType);
  return {
    ...parsed,
    email: acquirer.receiverEmail || null,
    dianValidated: Boolean(acquirer.found),
    dianStatusCode: acquirer.statusCode || null,
    dianMessage: acquirer.message || null,
  };
}

export async function lookupDianAcquirer(companyId, documentType, documentNumber) {
  const ctx = await loadCompanyLookupContext(companyId);

  if (!config.fePosUrl) {
    throw Object.assign(new Error('ServerFEpos no configurado (FEPOS_URL)'), { status: 503 });
  }

  const ping = await pingFePos();
  if (!ping.ok) {
    throw Object.assign(
      new Error(`ServerFEpos no disponible: ${ping.error}`),
      { status: 503, hint: ping.hint },
    );
  }

  if (!ctx.certificateReadiness.ready) {
    throw Object.assign(
      new Error('Configure y sincronice el certificado digital DIAN antes de consultar adquirientes'),
      { status: 400, missing: ctx.certificateReadiness.missing },
    );
  }

  const docType = normalizeDianDocumentType(documentType);
  const docNumber = String(documentNumber || '').replace(/\D/g, '').trim();
  if (!docType) {
    throw Object.assign(new Error('Tipo de documento inválido'), { status: 400 });
  }
  if (!docNumber) {
    throw Object.assign(new Error('Número de documento requerido'), { status: 400 });
  }

  const softwarePin = resolveSecret(ctx.companyRow.dian_software_pin) || '';
  const fePosResult = await lookupAcquirerFePos({
    companyId,
    documentType: docType,
    documentNumber: docNumber,
    softwareId: ctx.company.dianSoftwareId,
    softwarePin,
    dianEnvironment: ctx.dianEnvironment,
    testSetId: ctx.company.dianTestSetId,
  });

  const acquirer = {
    found: fePosResult.found,
    statusCode: fePosResult.statusCode,
    message: fePosResult.message,
    receiverName: fePosResult.receiverName,
    receiverEmail: fePosResult.receiverEmail,
  };

  return {
    ...acquirer,
    suggested: mapAcquirerToClientFields(docType, acquirer),
  };
}

function applySuggestedFields(payload, suggested) {
  if (!suggested) return payload;

  if (suggested.personType === 'juridica' && suggested.businessName) {
    payload.personType = 'juridica';
    payload.businessName = suggested.businessName;
    payload.firstName = suggested.businessName.split(' ')[0] || suggested.businessName;
    payload.middleName = null;
    payload.lastName = suggested.businessName.split(' ').slice(1).join(' ') || '.';
  } else if (suggested.personType === 'natural') {
    payload.personType = 'natural';
    if (suggested.firstName) payload.firstName = suggested.firstName;
    if (suggested.middleName != null) payload.middleName = suggested.middleName;
    if (suggested.lastName) payload.lastName = suggested.lastName;
    payload.businessName = null;
  }

  if (suggested.email) {
    payload.email = suggested.email;
  }

  return payload;
}

/**
 * Valida el cliente contra DIAN GetAcquirer cuando hay certificado configurado.
 * Enriquece nombre/correo con datos oficiales para reducir rechazos al facturar.
 */
export async function validateAndEnrichClientWithDian(companyId, payload) {
  let ctx;
  try {
    ctx = await loadCompanyLookupContext(companyId);
  } catch (err) {
    if (err.status) throw err;
    throw err;
  }

  if (!ctx.certificateReadiness.ready || !config.fePosUrl) {
    return { skipped: true, reason: 'Certificado DIAN o ServerFEpos no configurado' };
  }

  const ping = await pingFePos();
  if (!ping.ok) {
    return {
      skipped: true,
      reason: `No se pudo validar con DIAN: ${ping.error}`,
      warning: 'Cliente guardado sin validación DIAN (servicio no disponible)',
    };
  }

  let lookup;
  try {
    lookup = await lookupDianAcquirer(companyId, payload.documentType, payload.documentNumber);
  } catch (err) {
    if (err.status === 503) {
      return {
        skipped: true,
        reason: err.message,
        warning: 'Cliente guardado sin validación DIAN (servicio no disponible)',
      };
    }
    throw err;
  }

  if (!lookup.found) {
    throw Object.assign(
      new Error(
        lookup.message
          || 'El documento no está registrado en la base de adquirientes DIAN. Verifique tipo y número.',
      ),
      { status: 422, dian: lookup },
    );
  }

  applySuggestedFields(payload, lookup.suggested);

  return {
    skipped: false,
    validated: true,
    dian: lookup,
  };
}
