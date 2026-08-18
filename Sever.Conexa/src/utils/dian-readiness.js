/** Verifica datos mínimos para envío DIAN (UBL + habilitación) */
import { calcNitVerificationDigit } from './nit-dv.js';
import { resolveSecret } from './dian-certificate.js';
import { usesDianTestSet } from './dian-environment.js';

export function assessDianReadiness({ company, resolutions = [] }) {
  const missing = [];
  const warnings = [];

  if (!company?.nit) missing.push('NIT de la compañía');
  if (company?.verificationDigit === '' || company?.verificationDigit == null) {
    missing.push('Dígito de verificación (DV) del NIT emisor');
  }
  if (!company?.name) missing.push('Razón social / nombre de la compañía');
  if (!company?.email) missing.push('Correo de contacto del emisor');
  if (!company?.address) warnings.push('Dirección fiscal del emisor (recomendada para UBL)');
  if (!company?.dianSoftwareId) missing.push('Software ID registrado en DIAN');
  if (!company?.hasDianSoftwarePin) missing.push('Clave del software (PIN DIAN)');
  else if (!company?.pinDecryptOk) {
    missing.push('Clave del software (PIN DIAN) — vuelva a guardarla en Emisor DIAN');
  }

  const activeResolutions = resolutions.filter((r) => r.isActive);
  if (activeResolutions.length === 0) {
    missing.push('Al menos una resolución DIAN activa');
  }

  for (const r of activeResolutions) {
    const label = `${r.prefix || 'prefijo?'}`;
    if (!r.resolutionNumber) missing.push(`Número de resolución (${label})`);
    if (!r.resolutionDate) missing.push(`Fecha expedición resolución (${label})`);
    if (!r.validFrom || !r.validTo) missing.push(`Vigencia de resolución (${label})`);
    if (!r.technicalKey) missing.push(`Clave técnica (${label})`);
    if (usesDianTestSet(r.dianEnvironment) && !company?.dianTestSetId) {
      missing.push('Código Set de pruebas DIAN (ambiente habilitación)');
    }
  }

  const hasHabilitacion = activeResolutions.some((r) => usesDianTestSet(r.dianEnvironment));
  if (hasHabilitacion && !company?.dianTestSetId) {
    if (!missing.includes('Código Set de pruebas DIAN (ambiente habilitación)')) {
      missing.push('Código Set de pruebas DIAN (ambiente habilitación)');
    }
  }

  return {
    ready: missing.length === 0,
    missing,
    warnings,
    hasHabilitacion,
  };
}

export function formatCompanyDian(row) {
  if (!row) return null;
  const storedDv = row.verification_digit != null && row.verification_digit !== ''
    ? String(row.verification_digit)
    : '';
  const computedDv = calcNitVerificationDigit(row.nit);
  const verificationDigit = storedDv || (computedDv != null ? String(computedDv) : '');
  const pinStored = Boolean(row.dian_software_pin);
  const pinDecryptOk = Boolean(resolveSecret(row.dian_software_pin));
  return {
    nit: String(row.nit || '').replace(/\D/g, '').slice(0, 10),
    name: row.name,
    email: row.email || '',
    verificationDigit,
    address: row.address || '',
    dianSoftwareId: row.dian_software_id || '',
    hasDianSoftwarePin: pinStored,
    pinDecryptOk,
    dianTestSetId: row.dian_test_set_id || '',
  };
}

export function formatInvoiceEmail(row) {
  if (!row) return null;
  return {
    fromEmail: row.invoice_email_from || '',
    fromName: row.invoice_email_from_name || '',
    smtpHost: row.invoice_smtp_host || '',
    smtpPort: row.invoice_smtp_port != null ? Number(row.invoice_smtp_port) : 587,
    smtpSecure: row.invoice_smtp_secure ?? (Number(row.invoice_smtp_port) || 587) === 465,
    smtpUser: row.invoice_smtp_user || '',
    hasSmtpPassword: Boolean(row.invoice_smtp_password),
  };
}

export function assessInvoiceEmailReadiness(invoiceEmail) {
  const missing = [];
  if (!invoiceEmail?.fromEmail) missing.push('Correo remitente de facturas');
  if (!invoiceEmail?.fromName) missing.push('Nombre remitente de facturas');
  if (!invoiceEmail?.smtpHost) missing.push('Servidor SMTP');
  if (!invoiceEmail?.smtpUser) missing.push('Usuario SMTP');
  if (!invoiceEmail?.hasSmtpPassword) missing.push('Contraseña SMTP');
  return { ready: missing.length === 0, missing };
}
