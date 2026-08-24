/** Generador XML UBL 2.1 DIAN — Nota de ajuste al documento soporte (tipo 95) */

import { calcNitVerificationDigit } from './nit-dv.js';

/** Literal NSAD03 — sin espacio final: DIAN normaliza whitespace y falla si el literal lleva trailing space. */
const NAS_PROFILE_ID =
  'DIAN 2.1: Nota de ajuste al documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura o documento equivalente';
const DS_QR_PROD = 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=';
const DS_QR_HAB = 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtMoney(value) {
  return Number(value || 0).toFixed(2);
}

function fmtLineMoney(value) {
  return Number(value || 0).toFixed(4);
}

function formatDate(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s.slice(0, 10);
}

function formatIssueTime(time) {
  const raw = String(time || '00:00:00').slice(0, 8);
  if (/[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  return `${raw}-05:00`;
}

function profileExecutionId(environment) {
  return environment === 'produccion' ? '1' : '2';
}

function officialPlaceName(name, cityCode) {
  if (String(cityCode || '') === '11001' || /^bogot/i.test(String(name || ''))) {
    return 'Bogotá, D.C.';
  }
  const titled = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s,./-])(\S)/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
  return titled || 'Bogotá, D.C.';
}

const POSTAL_BY_CITY = {
  11001: '110111',
  '08372': '081040',
};

function postalZoneFromCity(cityCode, departmentCode) {
  const city = String(cityCode || '').replace(/\D/g, '').padStart(5, '0');
  if (POSTAL_BY_CITY[city]) return POSTAL_BY_CITY[city];
  const dept = String(departmentCode || city.slice(0, 2)).replace(/\D/g, '').padStart(2, '0');
  return `${dept}0001`;
}

function nitDv(number, storedDv) {
  if (storedDv != null && String(storedDv).trim() !== '') return String(storedDv).trim();
  const computed = calcNitVerificationDigit(number);
  return computed != null ? String(computed) : '0';
}

function buildNaturalPersonNames({ firstName, middleName, lastName }) {
  const first = (firstName || '').trim();
  const middle = (middleName || '').trim();
  const family = (lastName || '').trim();
  if (middle || !first.includes(' ')) {
    return { firstName: first || 'N/A', middleName: middle, familyName: family || 'N/A' };
  }
  const tokens = first.split(/\s+/).filter(Boolean);
  return {
    firstName: tokens[0] || 'N/A',
    middleName: tokens.slice(1).join(' '),
    familyName: family || 'N/A',
  };
}

function buildAddressBlock(party, { includePostalZone }) {
  const cityCode = escapeXml(party.cityCode || '11001');
  const cityName = escapeXml(officialPlaceName(party.cityName || 'Bogotá, D.C.', party.cityCode));
  const deptName = escapeXml(officialPlaceName(party.departmentName || 'Bogotá, D.C.', party.departmentCode === '11' ? '11001' : ''));
  const deptCode = escapeXml(party.departmentCode || '11');
  const addressLine = escapeXml(party.address || 'Sin dirección');
  const postal = escapeXml(party.postalZone || postalZoneFromCity(party.cityCode, party.departmentCode));
  const countryCode = escapeXml(party.countryCode || 'CO');
  const countryName = countryCode === 'CO' ? 'Colombia' : escapeXml(party.countryName || countryCode);

  return `<cbc:ID>${cityCode}</cbc:ID>
          <cbc:CityName>${cityName}</cbc:CityName>
          ${includePostalZone ? `<cbc:PostalZone>${postal}</cbc:PostalZone>` : ''}
          <cbc:CountrySubentity>${deptName}</cbc:CountrySubentity>
          <cbc:CountrySubentityCode>${deptCode}</cbc:CountrySubentityCode>
          <cac:AddressLine><cbc:Line>${addressLine}</cbc:Line></cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>${countryCode}</cbc:IdentificationCode>
            <cbc:Name languageID="es">${countryName}</cbc:Name>
          </cac:Country>`;
}

function buildPartyBlock({ party, isSupplier, isResident }) {
  const name = escapeXml(party.registrationName);
  const companyId = escapeXml(party.companyId);
  const isNatural = party.personType !== 'juridica';
  const taxLevel = escapeXml(party.taxLevelCode || 'R-99-PN');
  const taxListName = isNatural ? '49' : '48';
  const email = escapeXml(party.email || '');
  const phone = escapeXml(party.phone || '');
  const contactName = escapeXml(party.contactName || name);
  const additionalAccountId = party.personType === 'juridica' ? '1' : '2';
  // NAS: Supplier = proveedor; DIAN exige schemeName 31 + DV en PartyTaxScheme/CompanyID.
  const schemeName = isSupplier && isResident ? '31' : escapeXml(party.documentType || '31');
  const schemeId = nitDv(party.companyId, party.schemeId);
  const companyIdAttrs = `schemeID="${escapeXml(schemeId)}" schemeName="${schemeName}" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)" schemeAgencyID="195"`;
  const additionalAccountAttrs = isNatural
    ? `schemeName="${schemeName}"`
    : 'schemeAgencyID="195"';
  const partyIdentificationBlock = isNatural
    ? `<cac:PartyIdentification><cbc:ID schemeName="${schemeName}">${companyId}</cbc:ID></cac:PartyIdentification>`
    : '';
  const legalEntityBlock = `<cac:PartyLegalEntity>
        <cbc:RegistrationName>${name}</cbc:RegistrationName>
        <cbc:CompanyID ${companyIdAttrs}>${companyId}</cbc:CompanyID>
      </cac:PartyLegalEntity>`;
  const names = buildNaturalPersonNames(party);
  const personBlock = isNatural
    ? `<cac:Person>
        <cbc:FirstName>${escapeXml(names.firstName)}</cbc:FirstName>
        <cbc:FamilyName>${escapeXml(names.familyName)}</cbc:FamilyName>
        ${names.middleName ? `<cbc:MiddleName>${escapeXml(names.middleName)}</cbc:MiddleName>` : ''}
      </cac:Person>`
    : '';
  const taxSchemeId = isNatural ? 'ZZ' : '01';
  const taxSchemeName = isNatural ? 'No aplica' : 'IVA';
  const addressXml = buildAddressBlock(party, { includePostalZone: isResident });

  return `<cac:Accounting${isSupplier ? 'Supplier' : 'Customer'}Party>
    <cbc:AdditionalAccountID ${additionalAccountAttrs}>${additionalAccountId}</cbc:AdditionalAccountID>
    <cac:Party>
      ${partyIdentificationBlock}
      <cac:PartyName><cbc:Name>${name}</cbc:Name></cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          ${addressXml}
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${name}</cbc:RegistrationName>
        <cbc:CompanyID ${companyIdAttrs}>${companyId}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="${taxListName}">${taxLevel}</cbc:TaxLevelCode>
        <cac:RegistrationAddress>
          ${addressXml}
        </cac:RegistrationAddress>
        <cac:TaxScheme><cbc:ID>${taxSchemeId}</cbc:ID><cbc:Name>${taxSchemeName}</cbc:Name></cac:TaxScheme>
      </cac:PartyTaxScheme>
      ${legalEntityBlock}
      <cac:Contact>
        <cbc:Name>${isNatural ? '' : contactName}</cbc:Name>
        <cbc:Telephone>${phone}</cbc:Telephone>
        <cbc:ElectronicMail>${email}</cbc:ElectronicMail>
      </cac:Contact>
      ${personBlock}
    </cac:Party>
  </cac:Accounting${isSupplier ? 'Supplier' : 'Customer'}Party>`;
}

function buildTaxSubtotal(amount, taxableBase, percent, schemeId = '01', schemeName = 'IVA') {
  return `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${fmtMoney(taxableBase)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${fmtMoney(amount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${Number(percent).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>${escapeXml(schemeId)}</cbc:ID><cbc:Name>${escapeXml(schemeName)}</cbc:Name></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
}

function buildTaxTotal(amount, taxableBase, percent) {
  if (Number(amount) <= 0) return '';
  return `<cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${fmtMoney(amount)}</cbc:TaxAmount>
    ${buildTaxSubtotal(amount, taxableBase, percent)}
  </cac:TaxTotal>`;
}

function buildDocumentTaxTotal(lines) {
  const groups = new Map();
  for (const line of lines) {
    const rate = Number(Number(line.taxRate || 0).toFixed(2));
    const current = groups.get(rate) || { rate, base: 0, amount: 0 };
    current.base += Number(line.lineBase) || 0;
    current.amount += Number(line.taxAmount) || 0;
    groups.set(rate, current);
  }
  if (!groups.size) return '';
  const subtotals = [...groups.values()];
  const totalTax = subtotals.reduce((sum, group) => sum + group.amount, 0);
  if (totalTax <= 0) return '';

  return `<cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${fmtMoney(totalTax)}</cbc:TaxAmount>
    ${subtotals.map((group) => buildTaxSubtotal(group.amount, group.base, group.rate)).join('\n    ')}
  </cac:TaxTotal>`;
}

function buildWithholdingTaxTotal(taxes = []) {
  const valid = taxes.filter((t) => Number(t.vlrImpuesto) > 0);
  if (!valid.length) return '';
  const total = valid.reduce((sum, t) => sum + Number(t.vlrImpuesto), 0);
  const subtotals = valid.map((t) => {
    const schemeId = t.taxCode || '06';
    const schemeName = t.taxName || 'ReteRenta';
    const pct = Number(t.vlrCalc) || 0;
    return buildTaxSubtotal(Number(t.vlrImpuesto), Number(t.base), pct, schemeId, schemeName);
  });
  return `<cac:WithholdingTaxTotal>
    <cbc:TaxAmount currencyID="COP">${fmtMoney(total)}</cbc:TaxAmount>
    ${subtotals.join('\n    ')}
  </cac:WithholdingTaxTotal>`;
}

function buildCreditNoteLine(line, { issueDate, transmissionCode, transmissionLabel }) {
  const itemCode = String(line.itemCode || line.lineNumber || '1');
  const taxBlock = Number(line.taxAmount) > 0
    ? buildTaxTotal(line.taxAmount, line.lineBase, line.taxRate)
    : '';

  return `<cac:CreditNoteLine>
    <cbc:ID>${line.lineNumber}</cbc:ID>
    <cbc:CreditedQuantity unitCode="NIU">${Number(line.quantity).toFixed(2)}</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">${fmtLineMoney(line.lineBase)}</cbc:LineExtensionAmount>
    <cac:InvoicePeriod>
      <cbc:StartDate>${issueDate}</cbc:StartDate>
      <cbc:DescriptionCode>${escapeXml(transmissionCode)}</cbc:DescriptionCode>
      <cbc:Description>${escapeXml(transmissionLabel)}</cbc:Description>
    </cac:InvoicePeriod>
    ${taxBlock}
    <cac:Item>
      <cbc:Description>${escapeXml(line.description)}</cbc:Description>
      <cbc:BrandName>NA</cbc:BrandName>
      <cbc:ModelName>NA</cbc:ModelName>
      <cac:SellersItemIdentification>
        <cbc:ID>${escapeXml(itemCode)}</cbc:ID>
        <cbc:ExtendedID>${escapeXml(itemCode)}</cbc:ExtendedID>
      </cac:SellersItemIdentification>
      <cac:StandardItemIdentification>
        <cbc:ID schemeID="999" schemeName="Estándar de adopción del contribuyente">${escapeXml(itemCode)}</cbc:ID>
      </cac:StandardItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="COP">${fmtLineMoney(line.unitPrice)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="NIU">${Number(line.quantity).toFixed(2)}</cbc:BaseQuantity>
    </cac:Price>
  </cac:CreditNoteLine>`;
}

function buildVendorParty(client) {
  const clientName = client.personType === 'juridica' && client.businessName
    ? client.businessName
    : [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ').trim();
  const companyId = String(client.documentNumber || '').replace(/\D/g, '');
  return {
    registrationName: clientName || 'Proveedor',
    companyId,
    schemeId: client.verificationDigit || nitDv(companyId, client.verificationDigit),
    documentType: client.documentType || '13',
    taxLevelCode: client.taxLevelCode || 'R-99-PN',
    address: client.address || 'Sin dirección',
    cityCode: client.cityCode || '11001',
    cityName: client.cityName || 'Bogotá, D.C.',
    departmentCode: client.departmentCode || '11',
    departmentName: client.departmentName || 'Bogotá, D.C.',
    countryCode: client.countryCode || 'CO',
    email: client.email || '',
    phone: client.phone || '',
    contactName: clientName,
    personType: client.personType || 'natural',
    firstName: client.firstName || '',
    middleName: client.middleName || '',
    lastName: client.lastName || '',
  };
}

function buildCompanyCustomerParty(company) {
  const supplierNit = String(company.nit || '').replace(/\D/g, '');
  return {
    registrationName: company.name,
    companyId: supplierNit,
    schemeId: company.verificationDigit || nitDv(supplierNit, company.verificationDigit),
    documentType: '31',
    taxLevelCode: company.taxLevelCode || 'O-13',
    address: company.address || 'Sin dirección',
    cityCode: company.cityCode || '11001',
    cityName: company.cityName || 'Bogotá, D.C.',
    departmentCode: company.departmentCode || '11',
    departmentName: company.departmentName || 'Bogotá, D.C.',
    countryCode: 'CO',
    email: company.email || '',
    phone: company.phone || '',
    contactName: company.name,
    personType: 'juridica',
  };
}

/**
 * @param {{
 *   nota: object,
 *   fcxp: object,
 *   company: object,
 *   vendor: object,
 *   resolution: object,
 *   lines: object[],
 *   withholdingTaxes?: object[],
 * }} payload
 */
export function buildSupportAdjustmentNoteUbl({
  nota,
  fcxp,
  company,
  vendor,
  resolution,
  lines,
  withholdingTaxes = [],
  conceptUbl = null,
}) {
  const profileId = profileExecutionId(resolution.dianEnvironment);
  const issueDate = formatDate(nota.issueDate || nota.fechaNota);
  const issueTime = formatIssueTime(nota.issueTime || '00:00:00');
  const fullNumber = nota.cnsDocAjuste;
  const sourceNumber = fcxp.cnsDocSoporte;
  const sourceCuds = fcxp.cude || '';
  const sourceIssueDate = formatDate(fcxp.issueDate || fcxp.fechaFactura || fcxp.fechaCxp);
  const currency = 'COP';
  const isResident = String(vendor?.countryCode || 'CO').toUpperCase() === 'CO';
  const customizationId = isResident ? '10' : '11';
  const transmissionCode = String(fcxp.transmissionCode || '1');
  const transmissionLabel = transmissionCode === '2' ? 'Acumulado semanal' : 'Por operación';
  const supplierParty = buildVendorParty(vendor);
  const customerParty = buildCompanyCustomerParty(company);
  const ofeNit = String(company.nit || '').replace(/\D/g, '');

  const computedLines = lines.map((line) => {
    const qty = Number(line.quantity) || 1;
    const unitPrice = Number(line.unitPrice) || 0;
    const lineBase = Number(line.lineBase) || Math.max(0, qty * unitPrice);
    let taxAmount = Number(line.taxAmount) || 0;
    let taxRate = lineBase > 0 && taxAmount > 0
      ? Math.round((taxAmount / lineBase) * 10000) / 100
      : Number(line.taxRate) || 0;
    if (lineBase > 0 && taxAmount > 0) {
      taxRate = Math.round((taxAmount / lineBase) * 10000) / 100;
      taxAmount = Math.round(lineBase * taxRate / 100 * 100) / 100;
    }
    return {
      lineNumber: line.lineNumber,
      itemCode: line.itemCode || String(line.lineNumber || '1'),
      description: line.description || 'Ajuste documento soporte',
      quantity: qty,
      unitPrice: lineBase / (qty || 1),
      lineBase,
      taxRate,
      taxAmount,
    };
  });

  const subtotal = computedLines.reduce((sum, line) => sum + line.lineBase, 0);
  const ivaAmount = nota.afectaIva
    ? Math.round(computedLines.reduce((s, l) => s + l.taxAmount, 0) * 100) / 100
    : 0;
  const taxInclusive = Math.round((subtotal + ivaAmount) * 100) / 100;
  // DIAN NSAU14: PayableAmount = bruto + tributos − descuentos + cargos (retenciones van en WithholdingTaxTotal).
  const payable = taxInclusive;
  const documentTaxTotal = nota.afectaIva ? buildDocumentTaxTotal(computedLines) : '';
  // Retenciones (14.3.1): no van en NAS UBL; solo base + IVA para validación DIAN.
  const qrCode = `${profileId === '1' ? DS_QR_PROD : DS_QR_HAB}`;
  const creditNoteLinesXml = computedLines
    .map((line) => buildCreditNoteLine(line, { issueDate, transmissionCode, transmissionLabel }))
    .join('\n  ');

  return `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2     http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-CreditNote-2.1.xsd">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:InvoiceControl>
            <sts:InvoiceAuthorization>${escapeXml(resolution.resolutionNumber)}</sts:InvoiceAuthorization>
            <sts:AuthorizationPeriod>
              <cbc:StartDate>${formatDate(resolution.validFrom)}</cbc:StartDate>
              <cbc:EndDate>${formatDate(resolution.validTo)}</cbc:EndDate>
            </sts:AuthorizationPeriod>
            <sts:AuthorizedInvoices>
              <sts:Prefix>${escapeXml(resolution.prefix)}</sts:Prefix>
              <sts:From>${resolution.rangeFrom}</sts:From>
              <sts:To>${resolution.rangeTo}</sts:To>
            </sts:AuthorizedInvoices>
          </sts:InvoiceControl>
          <sts:InvoiceSource>
            <cbc:IdentificationCode listAgencyID="6" listAgencyName="United Nations Economic Commission for Europe" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode-2.1">CO</cbc:IdentificationCode>
          </sts:InvoiceSource>
          <sts:SoftwareProvider>
            <sts:ProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)" schemeID="${escapeXml(company.verificationDigit || '0')}" schemeName="31">${escapeXml(ofeNit)}</sts:ProviderID>
            <sts:SoftwareID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">${escapeXml(company.dianSoftwareId)}</sts:SoftwareID>
          </sts:SoftwareProvider>
          <sts:SoftwareSecurityCode schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000</sts:SoftwareSecurityCode>
          <sts:AuthorizationProvider>
            <sts:AuthorizationProviderID schemeID="4" schemeName="31" schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)">800197268</sts:AuthorizationProviderID>
          </sts:AuthorizationProvider>
          <sts:QRCode>${escapeXml(qrCode)}</sts:QRCode>
        </sts:DianExtensions>
      </ext:ExtensionContent>
    </ext:UBLExtension>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${customizationId}</cbc:CustomizationID>
  <cbc:ProfileID>${NAS_PROFILE_ID}</cbc:ProfileID>
  <cbc:ProfileExecutionID>${profileId}</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(fullNumber)}</cbc:ID>
  <cbc:UUID schemeID="${profileId}" schemeName="CUDS-SHA384">000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:CreditNoteTypeCode>95</cbc:CreditNoteTypeCode>
  ${nota.detalle ? `<cbc:Note>${escapeXml(nota.detalle)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${computedLines.length}</cbc:LineCountNumeric>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${escapeXml(conceptUbl?.referenceId || '1')}</cbc:ReferenceID>
    <cbc:ResponseCode>${escapeXml(conceptUbl?.responseCode || '5')}</cbc:ResponseCode>
    <cbc:Description>${escapeXml(conceptUbl?.description || nota.detalle || 'Nota de ajuste documento soporte')}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(sourceNumber)}</cbc:ID>
      <cbc:UUID schemeName="CUDS-SHA384">${escapeXml(sourceCuds)}</cbc:UUID>
      <cbc:IssueDate>${sourceIssueDate}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  ${buildPartyBlock({ party: supplierParty, isSupplier: true, isResident })}
  ${buildPartyBlock({ party: customerParty, isSupplier: false, isResident: true })}
  <cac:PaymentMeans>
    <cbc:ID>1</cbc:ID>
    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>
  </cac:PaymentMeans>
  ${documentTaxTotal}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${fmtMoney(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${fmtMoney(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${fmtMoney(taxInclusive)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="COP">0.00</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="COP">${fmtMoney(payable)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${creditNoteLinesXml}
</CreditNote>`;
}
