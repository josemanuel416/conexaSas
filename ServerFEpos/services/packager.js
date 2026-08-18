// services/packager.js
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { DOMParser } = require('@xmldom/xmldom');

/**
 * Extrae metadatos del XML UBL para construir el nombre de archivo DIAN.
 * Patron: {NIT}{TipoDoc}{NumeroFactura}.xml
 * Ej: 9001234561001SETP990000001.xml
 */
function buildDianFileName(xmlContent) {
  try {
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');

    const supplierParty = doc.getElementsByTagName('cac:AccountingSupplierParty')[0];
    const nit = supplierParty?.getElementsByTagName('cbc:CompanyID')[0]?.textContent?.trim() || '';

    const invoiceTypeCode =
      doc.getElementsByTagName('cbc:CreditNoteTypeCode')[0]?.textContent?.trim()
      || doc.getElementsByTagName('cbc:InvoiceTypeCode')[0]?.textContent?.trim()
      || '01';

    const invoiceId = doc.getElementsByTagName('cbc:ID')[0]?.textContent?.trim() || '';

    if (nit && invoiceId) {
      return `${nit}${invoiceTypeCode}${invoiceId}.xml`;
    }
  } catch (e) {
    console.warn('[PACKAGER] No se pudo extraer nombre DIAN del XML, usando fallback');
  }
  return null;
}

async function createZipFromXml(xmlContent, timestamp) {
  const dianName = buildDianFileName(xmlContent);
  const fileName = dianName || `${timestamp}_factura.xml`;

  console.log(`[PACKAGER] Archivo en ZIP: ${fileName}`);

  const zip = archiver('zip', { zlib: { level: 9 } });
  const bufferStream = new PassThrough();

  zip.pipe(bufferStream);
  zip.append(xmlContent, { name: fileName });
  await zip.finalize();

  const chunks = [];
  for await (const chunk of bufferStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = { createZipFromXml, buildDianFileName };
