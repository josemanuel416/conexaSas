import pg from 'pg';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { DOMParser } from '@xmldom/xmldom';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

function buildDianFileName(xmlContent) {
  const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
  const supplierParty = doc.getElementsByTagName('cac:AccountingSupplierParty')[0];
  const nit = supplierParty?.getElementsByTagName('cbc:CompanyID')[0]?.textContent?.trim() || '';
  const typeCode =
    doc.getElementsByTagName('cbc:CreditNoteTypeCode')[0]?.textContent?.trim()
    || doc.getElementsByTagName('cbc:InvoiceTypeCode')[0]?.textContent?.trim()
    || '01';
  const id = doc.getElementsByTagName('cbc:ID')[0]?.textContent?.trim() || '';
  return nit && id ? `${nit}${typeCode}${id}.xml` : null;
}

async function zipXml(xml) {
  const zip = archiver('zip', { zlib: { level: 9 } });
  const bufferStream = new PassThrough();
  zip.pipe(bufferStream);
  zip.append(xml, { name: buildDianFileName(xml) || 'doc.xml' });
  await zip.finalize();
  const chunks = [];
  for await (const chunk of bufferStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const { rows } = await pool.query(`
  SELECT s.signed_xml, s.zip_file_name, s.request_xml
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002' AND s.attempt_number = 15
`);

const signed = rows[0]?.signed_xml || '';
const storedZipName = rows[0]?.zip_file_name || '';
const computedZipName = buildDianFileName(signed);
console.log('Stored zip name:', storedZipName);
console.log('Computed zip name:', computedZipName);
console.log('Match:', storedZipName === computedZipName);

const buf = await zipXml(signed);
// naive unzip: find ProfileID in buffer as utf8
const asText = buf.toString('binary');
const profileInZip = signed.match(/<cbc:ProfileID>([^<]*)<\/cbc:ProfileID>/)?.[1];
console.log('Profile in signed len:', profileInZip?.length);
console.log('Profile found in zip binary search:', asText.includes(profileInZip?.slice(0, 40) || 'MISSING'));

await pool.end();
