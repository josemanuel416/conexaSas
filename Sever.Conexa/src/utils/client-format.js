import { calcNitVerificationDigit, normalizeDianDocumentType } from './nit-dv.js';

/** Expresión SQL para nombre visible del cliente (persona natural o jurídica). */
export function clientFullNameExpr(alias = 'c') {
  return `CASE
    WHEN ${alias}.person_type = 'juridica' AND NULLIF(TRIM(${alias}.business_name), '') IS NOT NULL
      THEN TRIM(${alias}.business_name)
    ELSE TRIM(CONCAT_WS(' ',
      NULLIF(TRIM(${alias}.first_name), ''),
      NULLIF(TRIM(${alias}.middle_name), ''),
      NULLIF(TRIM(${alias}.last_name), '')
    ))
  END`;
}

export function formatClient(c) {
  const documentType = normalizeDianDocumentType(c.document_type);
  const personType = c.person_type || 'natural';
  const businessName = c.business_name?.trim() || '';
  const firstName = c.first_name?.trim() || '';
  const middleName = c.middle_name?.trim() || '';
  const lastName = c.last_name?.trim() || '';

  const fullName =
    personType === 'juridica' && businessName
      ? businessName
      : [firstName, middleName, lastName].filter(Boolean).join(' ').trim();

  return {
    id: c.id,
    documentType,
    documentNumber: c.document_number,
    verificationDigit: c.verification_digit,
    documentDisplay: formatDocumentDisplay(documentType, c.document_number, c.verification_digit),
    personType,
    taxLevelCode: c.tax_level_code || 'R-99-PN',
    businessName: businessName || null,
    firstName,
    middleName,
    lastName,
    fullName,
    phone: c.phone,
    email: c.email,
    address: c.address,
    cityCode: c.city_code,
    cityName: c.city_name,
    departmentCode: c.department_code,
    departmentName: c.department_name,
    countryCode: c.country_code || 'CO',
    isActive: c.is_active,
  };
}

export function formatDocumentDisplay(documentType, number, dv) {
  if (!number) return '';
  if (documentType === '31' && dv != null && dv !== '') {
    return `${number}-${dv}`;
  }
  return number;
}

export function prepareClientPayload(body) {
  const documentType = normalizeDianDocumentType(body.documentType);
  const documentNumber = String(body.documentNumber || '').replace(/\D/g, '').trim();
  const personType = body.personType || (documentType === '31' ? 'juridica' : 'natural');

  let verificationDigit = body.verificationDigit;
  if (documentType === '31') {
    verificationDigit =
      verificationDigit != null && verificationDigit !== ''
        ? String(verificationDigit)
        : String(calcNitVerificationDigit(documentNumber) ?? '');
  } else {
    verificationDigit = null;
  }

  const businessName = body.businessName?.trim() || null;
  const firstName = body.firstName?.trim() || '';
  const middleName = body.middleName?.trim() || '';
  const lastName = body.lastName?.trim() || '';

  if (!documentNumber) {
    throw Object.assign(new Error('Número de documento requerido'), { status: 400 });
  }
  if (documentType === '31' && verificationDigit === '') {
    throw Object.assign(new Error('NIT inválido para calcular dígito de verificación'), { status: 400 });
  }
  if (personType === 'juridica' && !businessName) {
    throw Object.assign(new Error('Razón social requerida para persona jurídica'), { status: 400 });
  }
  if (personType === 'natural' && (!firstName || !lastName)) {
    throw Object.assign(new Error('Nombre y apellido requeridos para persona natural'), { status: 400 });
  }

  return {
    documentType,
    documentNumber,
    verificationDigit,
    personType,
    taxLevelCode: body.taxLevelCode || (personType === 'juridica' ? 'R-99-PJ' : 'R-99-PN'),
    businessName,
    firstName: personType === 'juridica' ? businessName.split(' ')[0] || businessName : firstName,
    middleName: personType === 'juridica' ? null : middleName || null,
    lastName: personType === 'juridica' ? businessName.split(' ').slice(1).join(' ') || '.' : lastName,
    phone: body.phone?.trim() || null,
    email: body.email?.trim() || null,
    address: body.address?.trim() || null,
    cityCode: body.cityCode?.trim() || null,
    cityName: body.cityName?.trim() || null,
    departmentCode: body.departmentCode?.trim() || null,
    departmentName: body.departmentName?.trim() || null,
    countryCode: body.countryCode?.trim() || 'CO',
    isActive: body.isActive,
  };
}
