/** Generador UBL AttachedDocument (contenedor factura + ApplicationResponse DIAN) */

import crypto from 'crypto';
import { nowAppTimezoneParts } from './app-timezone.js';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function nowBogota() {
  const { date, time } = nowAppTimezoneParts();
  return { date, time };
}

/** Embebe XML literal en CDATA, como en ejemplos DIAN reales. */
function wrapEmbeddedXml(xml) {
  const content = String(xml || '').replace(/^\uFEFF/, '').trim();
  if (!content) throw new Error('XML embebido vacío');
  if (!content.includes(']]>')) {
    return `<![CDATA[${content}]]>`;
  }
  return `<![CDATA[${content.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

function buildTaxParty({
  name,
  nit,
  dv,
  documentType = '31',
  taxLevelCode = 'R-99-PN',
  isNatural = false,
  taxSchemeId,
  taxSchemeName,
}) {
  const companyIdAttrs = isNatural
    ? `schemeName="${escapeXml(documentType)}" schemeAgencyID="195"`
    : `schemeID="${escapeXml(dv || '0')}" schemeName="31" schemeAgencyID="195" schemeAgencyName="CO, DIAN (Dirección de Impuestos y Aduanas Nacionales)"`;

  const schemeId = taxSchemeId || (isNatural ? 'ZZ' : '01');
  const schemeName = taxSchemeName || (isNatural ? 'IVA' : 'IVA');

  return `<cac:PartyTaxScheme>
    <cbc:RegistrationName>${escapeXml(name)}</cbc:RegistrationName>
    <cbc:CompanyID ${companyIdAttrs}>${escapeXml(nit)}</cbc:CompanyID>
    <cbc:TaxLevelCode listName="${isNatural ? '49' : '48'}">${escapeXml(taxLevelCode)}</cbc:TaxLevelCode>
    <cac:TaxScheme>
      <cbc:ID>${schemeId}</cbc:ID>
      <cbc:Name>${schemeName}</cbc:Name>
    </cac:TaxScheme>
  </cac:PartyTaxScheme>`;
}

/**
 * @param {{
 *   invoice: object,
 *   company: object,
 *   client: object,
 *   resolution: object,
 *   signedXml: string,
 *   applicationResponse: ReturnType<import('./dian-response.js').parseDianApplicationResponse>,
 *   containerId?: string,
 * }} params
 */
export function buildAttachedDocumentUbl({
  invoice,
  company,
  client,
  resolution,
  signedXml,
  applicationResponse,
  containerId,
}) {
  if (!signedXml?.trim()) throw new Error('Falta XML firmado de la factura');
  if (!applicationResponse?.applicationResponseXml) {
    throw new Error('Falta ApplicationResponse de la DIAN');
  }

  const issued = nowBogota();
  const profileId = profileExecutionId(resolution.dianEnvironment);
  const fullNumber = invoice.fullNumber || invoice.internalNumber;
  const containerConsecutive = containerId || crypto.randomUUID();

  const invoiceEmbedded = wrapEmbeddedXml(signedXml);
  const appResponseEmbedded = wrapEmbeddedXml(applicationResponse.applicationResponseXml);

  const supplierName = company.registrationName || company.name || 'Emisor';
  const supplierNit = company.nit || '';
  const supplierDv = company.verificationDigit ?? company.dv ?? '';

  const clientName = client.registrationName
    || client.fullName
    || client.businessName
    || [client.firstName, client.lastName].filter(Boolean).join(' ')
    || 'Cliente';
  const clientNit = client.documentNumber || client.companyId || '';
  const clientIsNatural = client.personType !== 'juridica';
  const clientDocType = client.documentType || (clientIsNatural ? '13' : '31');

  const refIssueDate = formatDate(invoice.issueDate || applicationResponse.issueDate);
  const refCufe = applicationResponse.cufe || invoice.cufe || '';
  const validationDate = formatDate(applicationResponse.issueDate || applicationResponse.validationDate || issued.date);
  const validationTime = formatIssueTime(applicationResponse.issueTime || applicationResponse.validationTime || issued.time);

  return `<?xml version="1.0" encoding="utf-8"?>
<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>Documentos adjuntos</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ProfileExecutionID>${profileId}</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(containerConsecutive)}</cbc:ID>
  <cbc:IssueDate>${issued.date}</cbc:IssueDate>
  <cbc:IssueTime>${issued.time}</cbc:IssueTime>
  <cbc:DocumentType>Contenedor de Factura Electrónica</cbc:DocumentType>
  <cbc:ParentDocumentID>${escapeXml(fullNumber)}</cbc:ParentDocumentID>
  <cac:SenderParty>
    ${buildTaxParty({
      name: supplierName,
      nit: supplierNit,
      dv: supplierDv,
      taxLevelCode: company.taxLevelCode || 'O-47',
      isNatural: false,
      taxSchemeId: '01',
      taxSchemeName: 'IVA',
    })}
  </cac:SenderParty>
  <cac:ReceiverParty>
    ${buildTaxParty({
      name: clientName,
      nit: clientNit,
      dv: client.verificationDigit || client.documentDv || '',
      documentType: clientDocType,
      taxLevelCode: client.taxLevelCode || 'R-99-PN',
      isNatural: clientIsNatural,
      taxSchemeId: 'ZZ',
      taxSchemeName: 'IVA',
    })}
  </cac:ReceiverParty>
  <cac:Attachment>
    <cac:ExternalReference>
      <cbc:MimeCode>text/xml</cbc:MimeCode>
      <cbc:EncodingCode>UTF-8</cbc:EncodingCode>
      <cbc:Description>${invoiceEmbedded}</cbc:Description>
    </cac:ExternalReference>
  </cac:Attachment>
  <cac:ParentDocumentLineReference>
    <cbc:LineID>1</cbc:LineID>
    <cac:DocumentReference>
      <cbc:ID>${escapeXml(fullNumber)}</cbc:ID>
      <cbc:UUID schemeName="CUFE-SHA384">${escapeXml(refCufe)}</cbc:UUID>
      <cbc:IssueDate>${refIssueDate}</cbc:IssueDate>
      <cbc:DocumentType>ApplicationResponse</cbc:DocumentType>
      <cac:Attachment>
        <cac:ExternalReference>
          <cbc:MimeCode>text/xml</cbc:MimeCode>
          <cbc:EncodingCode>UTF-8</cbc:EncodingCode>
          <cbc:Description>${appResponseEmbedded}</cbc:Description>
        </cac:ExternalReference>
      </cac:Attachment>
      <cac:ResultOfVerification>
        <cbc:ValidatorID>${escapeXml(applicationResponse.validatorId)}</cbc:ValidatorID>
        <cbc:ValidationResultCode>${escapeXml(applicationResponse.responseCode || '02')}</cbc:ValidationResultCode>
        <cbc:ValidationDate>${validationDate}</cbc:ValidationDate>
        <cbc:ValidationTime>${validationTime}</cbc:ValidationTime>
      </cac:ResultOfVerification>
    </cac:DocumentReference>
  </cac:ParentDocumentLineReference>
</AttachedDocument>`;
}
