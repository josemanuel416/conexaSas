/** Generador XML UBL 2.1 DIAN para notas crédito (tipo 91) */

import { buildInvoiceUbl } from './ubl-invoice.js';
import { resolveCreditNoteSourceReference, resolveInvoiceDianNumber } from './invoice-dian-number.js';

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

function buildCreditNoteLine(line) {
  const taxBlock =
    Number(line.taxAmount) > 0
      ? buildTaxTotal(line.taxAmount, line.lineBase, line.taxRate)
      : '';

  return `<cac:CreditNoteLine>
    <cbc:ID>${line.lineNumber}</cbc:ID>
    <cbc:CreditedQuantity unitCode="NIU">${Number(line.quantity)}</cbc:CreditedQuantity>
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
  </cac:CreditNoteLine>`;
}

function extractPartyBlocksFromInvoiceUbl(invoiceUbl) {
  const supplierMatch = invoiceUbl.match(/<cac:AccountingSupplierParty[\s\S]*?<\/cac:AccountingSupplierParty>/);
  const customerMatch = invoiceUbl.match(/<cac:AccountingCustomerParty[\s\S]*?<\/cac:AccountingCustomerParty>/);
  return {
    supplier: supplierMatch?.[0] || '',
    customer: customerMatch?.[0] || '',
  };
}

/**
 * @param {{
 *   creditNote: object,
 *   sourceInvoice: object,
 *   company: object,
 *   client: object,
 *   resolution: object,
 *   lines: object[],
 *   conceptUbl?: object,
 * }} payload
 */
export function buildCreditNoteUbl({
  creditNote,
  sourceInvoice,
  company,
  client,
  resolution,
  lines,
  conceptUbl,
}) {
  const sourceRef = resolveCreditNoteSourceReference(creditNote, sourceInvoice);
  if (!sourceRef?.fullNumber) {
    throw new Error('La factura origen no tiene numeración DIAN para referenciar en la nota crédito');
  }

  const dianNumber = resolveInvoiceDianNumber(creditNote);
  const documentId = dianNumber?.fullNumber || creditNote.fullNumber;
  if (!documentId || /^NC-/i.test(documentId)) {
    throw new Error('La nota crédito no tiene numeración DIAN (prefijo + consecutivo de resolución)');
  }
  const invoiceUbl = buildInvoiceUbl({
    invoice: { ...creditNote, fullNumber: documentId },
    company,
    client,
    resolution,
    lines,
  });
  const { supplier, customer } = extractPartyBlocksFromInvoiceUbl(invoiceUbl);

  const currency = creditNote.currency || 'COP';
  const issueDate = formatDate(creditNote.issueDate);
  const issueTime = formatIssueTime(creditNote.issueTime);
  const profileId = profileExecutionId(resolution.dianEnvironment);
  const supplierNit = company.nit;
  const supplierDv = company.verificationDigit || '0';
  const sourceCufe = sourceInvoice.cufe || '';
  const sourceNumber = sourceRef.fullNumber;
  const sourceIssueDate = formatDate(sourceInvoice.issueDate);

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

  const subtotal = Number(creditNote.subtotal) || 0;
  const taxAmount = Number(creditNote.taxAmount) || 0;
  const total = Number(creditNote.total) || 0;
  const taxExclusive = Math.max(0, subtotal);
  const documentTaxTotal = buildTaxTotal(taxAmount, taxExclusive, computedLines[0]?.taxRate || 19);
  const creditNoteLinesXml = computedLines.map(buildCreditNoteLine).join('\n  ');
  const reason = creditNote.notes || conceptUbl?.description || 'Anulación de factura electrónica';
  const customizationId = conceptUbl?.customizationId || '20';
  const responseCode = conceptUbl?.responseCode || '2';
  const referenceId = conceptUbl?.referenceId || sourceNumber;
  const discrepancyDescription = conceptUbl?.description || reason;
  const profileIdLabel = conceptUbl?.profileId || 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta';
  const paymentDueDate = formatDate(creditNote.dueDate || creditNote.issueDate);

  const qrCode = `NroFactura=${documentId}, NitFacturador=${supplierNit}, NitAdquiriente=${String(client.documentNumber || '').replace(/\D/g, '')}, FechaFactura=${issueDate}, ValorTotalFactura=${fmtMoney(total)}`;

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
  <cbc:CustomizationID>${escapeXml(customizationId)}</cbc:CustomizationID>
  <cbc:ProfileID>${escapeXml(profileIdLabel)}</cbc:ProfileID>
  <cbc:ProfileExecutionID>${profileId}</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(documentId)}</cbc:ID>
  <cbc:UUID schemeID="${profileId}" schemeName="CUDE-SHA384">000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:CreditNoteTypeCode>${escapeXml(conceptUbl?.documentTypeCode || '91')}</cbc:CreditNoteTypeCode>
  <cbc:Note>${escapeXml(reason)}</cbc:Note>
  <cbc:DocumentCurrencyCode>${escapeXml(currency)}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${computedLines.length}</cbc:LineCountNumeric>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${escapeXml(referenceId)}</cbc:ReferenceID>
    <cbc:ResponseCode>${escapeXml(responseCode)}</cbc:ResponseCode>
    <cbc:Description>${escapeXml(discrepancyDescription)}</cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(sourceNumber)}</cbc:ID>
      <cbc:UUID schemeName="CUFE-SHA384">${escapeXml(sourceCufe)}</cbc:UUID>
      <cbc:IssueDate>${sourceIssueDate}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  ${supplier}
  ${customer}
  <cac:PaymentMeans>
    <cbc:ID>1</cbc:ID>
    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${paymentDueDate}</cbc:PaymentDueDate>
  </cac:PaymentMeans>
  ${documentTaxTotal}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${fmtMoney(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${fmtMoney(taxExclusive)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${fmtMoney(total)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="COP">${fmtMoney(creditNote.discountAmount || 0)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="COP">${fmtMoney(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${creditNoteLinesXml}
</CreditNote>`;
}
