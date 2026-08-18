/** Generador XML UBL 2.1 DIAN para facturas de venta (tipo 01) */

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

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);
  return s.slice(0, 10);
}

function fmtLineMoney(value) {
  return Number(value || 0).toFixed(4);
}

function formatIssueTime(time) {
  const raw = String(time || '00:00:00').slice(0, 8);
  if (/[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  return `${raw}-05:00`;
}

function profileExecutionId(environment) {
  return environment === 'produccion' ? '1' : '2';
}

function buildQrCode({ fullNumber, supplierNit, customerId, issueDate, total }) {
  return `NroFactura=${fullNumber}, NitFacturador=${supplierNit}, NitAdquiriente=${customerId}, FechaFactura=${issueDate}, ValorTotalFactura=${fmtMoney(total)}`;
}

function buildNaturalPersonNames({ firstName, middleName, lastName }) {
  const first = (firstName || '').trim();
  const middle = (middleName || '').trim();
  const family = (lastName || '').trim();

  if (middle || !first.includes(' ')) {
    return {
      firstName: first || 'N/A',
      middleName: middle,
      familyName: family || 'N/A',
    };
  }

  const tokens = first.split(/\s+/).filter(Boolean);
  return {
    firstName: tokens[0] || 'N/A',
    middleName: tokens.slice(1).join(' '),
    familyName: family || 'N/A',
  };
}

function buildPartyBlock({ party, isSupplier, prefix }) {
  const name = escapeXml(party.registrationName);
  const companyId = escapeXml(party.companyId);
  const docType = escapeXml(party.documentType || '31');
  const isNatural = !isSupplier && party.personType !== 'juridica';
  const schemeId = isNatural ? '' : escapeXml(party.schemeId || '0');
  const taxLevel = escapeXml(party.taxLevelCode || 'R-99-PN');
  const taxListName = isNatural ? '49' : '48';
  const customerTaxSchemeId = isNatural ? 'ZZ' : '01';
  const customerTaxSchemeName = isNatural ? 'No aplica' : 'IVA';
  const cityCode = escapeXml(party.cityCode || '11001');
  const cityName = escapeXml(party.cityName || 'BOGOTA');
  const deptName = escapeXml(party.departmentName || 'Bogotá D.C.');
  const deptCode = escapeXml(party.departmentCode || '11');
  const addressLine = escapeXml(party.address || 'Sin dirección');
  const email = escapeXml(party.email || '');
  const phone = escapeXml(party.phone || '');
  const contactName = escapeXml(party.contactName || name);
  const additionalAccountId = party.personType === 'juridica' ? '1' : '2';

  const companyIdAttrs = isNatural
    ? `schemeName="${docType}" schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)"`
    : `schemeID="${schemeId}" schemeName="${docType}" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)" schemeAgencyID="195"`;

  const additionalAccountAttrs = isNatural
    ? `schemeName="${docType}"`
    : 'schemeAgencyID="195"';

  const partyIdentificationBlock = isNatural
    ? `<cac:PartyIdentification><cbc:ID>${companyId}</cbc:ID></cac:PartyIdentification>`
    : '';

  const corporateScheme = isSupplier && prefix
    ? `<cac:CorporateRegistrationScheme><cbc:ID>${escapeXml(prefix)}</cbc:ID></cac:CorporateRegistrationScheme>`
    : isSupplier
      ? `<cac:CorporateRegistrationScheme><cbc:Name>${name}</cbc:Name></cac:CorporateRegistrationScheme>`
      : '';

  const legalEntityBlock = isSupplier || party.personType === 'juridica' || isNatural
    ? `<cac:PartyLegalEntity>
        <cbc:RegistrationName>${name}</cbc:RegistrationName>
        <cbc:CompanyID ${companyIdAttrs}>${companyId}</cbc:CompanyID>
        ${corporateScheme}
      </cac:PartyLegalEntity>`
    : '';

  const names = buildNaturalPersonNames(party);
  const personBlock = isNatural
    ? `<cac:Person>
        <cbc:FirstName>${escapeXml(names.firstName)}</cbc:FirstName>
        <cbc:FamilyName>${escapeXml(names.familyName)}</cbc:FamilyName>
        ${names.middleName ? `<cbc:MiddleName>${escapeXml(names.middleName)}</cbc:MiddleName>` : ''}
      </cac:Person>`
    : '';

  const taxSchemeId = isSupplier ? '01' : customerTaxSchemeId;
  const taxSchemeName = isSupplier ? 'IVA' : customerTaxSchemeName;

  return `<cac:Accounting${isSupplier ? 'Supplier' : 'Customer'}Party>
    <cbc:AdditionalAccountID ${additionalAccountAttrs}>${additionalAccountId}</cbc:AdditionalAccountID>
    <cac:Party>
      ${partyIdentificationBlock}
      <cac:PartyName><cbc:Name>${name}</cbc:Name></cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          <cbc:ID>${cityCode}</cbc:ID>
          <cbc:CityName>${cityName}</cbc:CityName>
          <cbc:CountrySubentity>${deptName}</cbc:CountrySubentity>
          <cbc:CountrySubentityCode>${deptCode}</cbc:CountrySubentityCode>
          <cac:AddressLine><cbc:Line>${addressLine}</cbc:Line></cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>CO</cbc:IdentificationCode>
            <cbc:Name languageID="es">Colombia</cbc:Name>
          </cac:Country>
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${name}</cbc:RegistrationName>
        <cbc:CompanyID ${companyIdAttrs}>${companyId}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="${taxListName}">${taxLevel}</cbc:TaxLevelCode>
        <cac:RegistrationAddress>
          <cbc:ID>${cityCode}</cbc:ID>
          <cbc:CityName>${cityName}</cbc:CityName>
          <cbc:CountrySubentity>${deptName}</cbc:CountrySubentity>
          <cbc:CountrySubentityCode>${deptCode}</cbc:CountrySubentityCode>
          <cac:AddressLine><cbc:Line>${addressLine}</cbc:Line></cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>CO</cbc:IdentificationCode>
            <cbc:Name languageID="es">Colombia</cbc:Name>
          </cac:Country>
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

function buildTaxTotal(amount, taxableBase, percent) {
  if (Number(amount) <= 0) return '';
  return `<cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${fmtMoney(amount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${fmtMoney(taxableBase)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${fmtMoney(amount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>${Number(percent).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;
}

function buildInvoiceLine(line) {
  const taxBlock =
    Number(line.taxAmount) > 0
      ? buildTaxTotal(line.taxAmount, line.lineBase, line.taxRate)
      : '';

  return `<cac:InvoiceLine>
    <cbc:ID>${line.lineNumber}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">${Number(line.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">${fmtLineMoney(line.lineBase)}</cbc:LineExtensionAmount>
    ${taxBlock}
    <cac:Item>
      <cbc:Description>${escapeXml(line.description)}</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>${escapeXml(line.itemCode)}</cbc:ID></cac:SellersItemIdentification>
      <cac:StandardItemIdentification>
        <cbc:ID schemeID="999" schemeName="Estándar de adopción del contribuyente">${escapeXml(line.itemCode)}</cbc:ID>
      </cac:StandardItemIdentification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="COP">${fmtLineMoney(line.unitPrice)}</cbc:PriceAmount>
      <cbc:BaseQuantity unitCode="NIU">${Number(line.quantity).toFixed(2)}</cbc:BaseQuantity>
    </cac:Price>
  </cac:InvoiceLine>`;
}

/**
 * @param {{
 *   invoice: object,
 *   company: object,
 *   client: object,
 *   resolution: object,
 *   lines: object[],
 * }} payload
 */
export function buildInvoiceUbl({ invoice, company, client, resolution, lines }) {
  const currency = invoice.currency || 'COP';
  const issueDate = formatDate(invoice.issueDate);
  const issueTime = formatIssueTime(invoice.issueTime);
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : '';
  const profileId = profileExecutionId(resolution.dianEnvironment);
  const fullNumber = invoice.fullNumber;
  const supplierNit = company.nit;
  const supplierDv = company.verificationDigit || '0';
  const customerDocType = client.documentType || '13';
  const customerSchemeId =
    customerDocType === '31' ? String(client.verificationDigit || '0') : '0';
  const customerCompanyId = String(client.documentNumber || '').replace(/\D/g, '');

  const supplierParty = {
    registrationName: company.name,
    companyId: supplierNit,
    schemeId: supplierDv,
    documentType: '31',
    taxLevelCode: company.taxLevelCode || 'R-99-PN',
    address: company.address,
    cityCode: company.cityCode || '11001',
    cityName: company.cityName || 'BOGOTA',
    departmentCode: company.departmentCode || '11',
    departmentName: company.departmentName || 'Bogotá D.C.',
    email: company.email,
    phone: company.phone || '',
    contactName: company.name,
    personType: 'juridica',
  };

  const clientName =
    client.personType === 'juridica' && client.businessName
      ? client.businessName
      : [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ').trim();

  const customerParty = {
    registrationName: clientName,
    companyId: customerCompanyId,
    schemeId: customerSchemeId,
    documentType: customerDocType,
    taxLevelCode: client.taxLevelCode || 'R-99-PN',
    address: client.address || 'Sin dirección',
    cityCode: client.cityCode || '11001',
    cityName: client.cityName || 'BOGOTA',
    departmentCode: client.departmentCode || '11',
    departmentName: client.departmentName || 'Bogotá D.C.',
    email: client.email || '',
    phone: client.phone || '',
    contactName: clientName,
    personType: client.personType || 'natural',
    firstName: client.firstName || '',
    middleName: client.middleName || '',
    lastName: client.lastName || '',
  };

  const computedLines = lines.map((line) => {
    const qty = Number(line.quantity) || 1;
    const unitPrice = Number(line.unitPrice) || 0;
    const discount = Number(line.discountAmount) || 0;
    const taxRate = Number(line.taxRate) || 0;
    const lineBase = Math.max(0, qty * unitPrice - discount);
    const taxAmount = Number(line.taxAmount) || Math.round(lineBase * (taxRate / 100) * 100) / 100;
    return {
      lineNumber: line.lineNumber,
      itemCode: line.itemCode,
      description: line.description,
      quantity: qty,
      unitPrice,
      lineBase,
      taxRate,
      taxAmount,
    };
  });

  const subtotal = Number(invoice.subtotal) || 0;
  const taxAmount = Number(invoice.taxAmount) || 0;
  const total = Number(invoice.total) || 0;
  const taxExclusive = Math.max(0, subtotal);
  const documentTaxTotal = buildTaxTotal(taxAmount, taxExclusive, computedLines[0]?.taxRate || 19);
  const qrCode = buildQrCode({
    fullNumber,
    supplierNit,
    customerId: customerCompanyId,
    issueDate,
    total,
  });

  const invoiceLinesXml = computedLines.map(buildInvoiceLine).join('\n  ');

  return `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2     http://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd">
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
            <sts:ProviderID schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)" schemeID="${escapeXml(supplierDv)}" schemeName="31">${escapeXml(supplierNit)}</sts:ProviderID>
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
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID>
  <cbc:ProfileExecutionID>${profileId}</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(fullNumber)}</cbc:ID>
  <cbc:UUID schemeID="${profileId}" schemeName="CUFE-SHA384">000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  ${dueDate ? `<cbc:DueDate>${dueDate}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  ${invoice.notes ? `<cbc:Note>${escapeXml(invoice.notes)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${escapeXml(currency)}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${computedLines.length}</cbc:LineCountNumeric>
  ${buildPartyBlock({ party: supplierParty, isSupplier: true, prefix: resolution.prefix })}
  ${buildPartyBlock({ party: customerParty, isSupplier: false })}
  <cac:PaymentMeans>
    <cbc:ID>1</cbc:ID>
    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>
    ${dueDate ? `<cbc:PaymentDueDate>${dueDate}</cbc:PaymentDueDate>` : ''}
  </cac:PaymentMeans>
  ${documentTaxTotal}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${fmtMoney(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${fmtMoney(taxExclusive)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${fmtMoney(total)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="COP">${fmtMoney(invoice.discountAmount || 0)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="COP">${fmtMoney(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${invoiceLinesXml}
</Invoice>`;
}
