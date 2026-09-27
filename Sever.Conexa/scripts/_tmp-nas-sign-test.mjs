/**
 * Genera XML NAS actual y opcionalmente lo firma con ServerFEpos (/firmar).
 * Uso: node scripts/_tmp-nas-sign-test.mjs [--sign]
 */
import pg from 'pg';
import fs from 'fs';
import { buildSupportAdjustmentNoteUbl } from '../src/utils/ubl-support-adjustment-note.js';
import { buildAdjustmentNoteConceptUbl } from '../src/utils/dian-adjustment-note-concepts.js';
import { loadNota } from '../src/utils/fcxp-notas.js';

const sign = process.argv.includes('--sign');
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows: notaRows } = await pool.query(`
  SELECT n.id, n.company_id, n.fcxp_id
  FROM fcxpdbcr n
  WHERE n.cns_doc_ajuste = 'SEDS984000002'
  LIMIT 1
`);
if (!notaRows[0]) {
  console.error('Nota no encontrada');
  process.exit(1);
}

const { id: notaId, company_id: companyId, fcxp_id: fcxpId } = notaRows[0];
const nota = await loadNota(notaId, companyId);

const { rows: fcxpRows } = await pool.query('SELECT * FROM fcxp WHERE id = $1', [fcxpId]);
const { rows: companyRows } = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
const { rows: clientRows } = await pool.query(
  'SELECT * FROM clients WHERE id = $1',
  [fcxpRows[0].client_id],
);
const { rows: resRows } = await pool.query(
  `SELECT * FROM dian_resolutions WHERE company_id = $1 AND prefix = $2 LIMIT 1`,
  [companyId, nota.cnsDocAjuste?.replace(/\d+$/, '') || 'SEDS'],
);

const fcxp = fcxpRows[0];
const company = companyRows[0];
const vendor = clientRows[0];

const ublLines = [{
  lineNumber: 1,
  itemCode: '1',
  description: nota.detalle || 'Nota de ajuste',
  quantity: 1,
  unitPrice: nota.vlrNota,
  lineBase: nota.vlrNota,
  taxAmount: nota.afectaIva ? nota.vlrIva : 0,
  taxRate: nota.vlrNota > 0 && nota.vlrIva > 0 ? (nota.vlrIva / nota.vlrNota) * 100 : 0,
}];

const conceptUbl = nota.dianCode
  ? buildAdjustmentNoteConceptUbl({ dianCode: nota.dianCode, description: nota.conceptoDescripcion || nota.detalle })
  : null;

const xml = buildSupportAdjustmentNoteUbl({
  nota: { ...nota, issueDate: '2026-08-23', issueTime: '17:15:00-05:00' },
  fcxp: {
    cnsDocSoporte: fcxp.cns_doc_soporte,
    cude: fcxp.cude,
    issueDate: fcxp.issue_date || fcxp.fecha_factura,
    transmissionCode: fcxp.transmission_code || '1',
  },
  company: {
    name: company.name,
    nit: company.nit,
    verificationDigit: company.verification_digit,
    dianSoftwareId: company.dian_software_id,
    address: company.address,
    cityCode: company.city_code,
    cityName: company.city_name,
    departmentCode: company.department_code,
    departmentName: company.department_name,
    email: company.email,
    phone: company.phone,
    taxLevelCode: company.tax_level_code,
  },
  vendor: {
    documentNumber: vendor.document_number,
    verificationDigit: vendor.verification_digit,
    documentType: vendor.document_type,
    firstName: vendor.first_name,
    middleName: vendor.middle_name,
    lastName: vendor.last_name,
    businessName: vendor.business_name,
    personType: vendor.person_type,
    address: vendor.address,
    cityCode: vendor.city_code,
    cityName: vendor.city_name,
    departmentCode: vendor.department_code,
    departmentName: vendor.department_name,
    email: vendor.email,
    phone: vendor.phone,
    taxLevelCode: vendor.tax_level_code,
    countryCode: vendor.country_code,
  },
  resolution: {
    resolutionNumber: resRows[0]?.resolution_number || '18760000001',
    prefix: resRows[0]?.prefix || 'SEDS',
    rangeFrom: resRows[0]?.range_from || 984000000,
    rangeTo: resRows[0]?.range_to || 984999999,
    validFrom: resRows[0]?.valid_from,
    validTo: resRows[0]?.valid_to,
    dianEnvironment: resRows[0]?.dian_environment || 'habilitacion',
  },
  lines: ublLines,
  withholdingTaxes: nota.taxes?.map((t) => ({
    vlrImpuesto: t.vlrImpuesto,
    base: t.base,
    vlrCalc: t.vlrCalc,
    taxCode: t.taxCode || '06',
    taxName: t.taxCode === '05' ? 'ReteIVA' : 'ReteRenta',
  })) || [],
  conceptUbl,
});

const outPath = new URL('../tmp-nas-preview.xml', import.meta.url);
fs.writeFileSync(outPath, xml, 'utf8');
console.log('XML guardado:', outPath.pathname);

const start = xml.indexOf('CreditNoteTypeCode');
console.log(xml.slice(start, start + 900));

const payable = xml.match(/PayableAmount[^>]*>([^<]+)/)?.[1];
const refId = xml.match(/ReferenceID>([^<]+)/)?.[1];
console.log('Payable:', payable, 'ReferenceID:', refId);

if (sign) {
  const fePosUrl = process.env.FEPOS_URL || 'http://localhost:3010';
  const res = await fetch(`${fePosUrl}/firmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      xml,
      softwarePin: process.env.DIAN_SOFTWARE_PIN || '',
      softwareId: company.dian_software_id,
    }),
  });
  const body = await res.json();
  console.log('FEpos firmar:', res.status, JSON.stringify(body, null, 2).slice(0, 1500));
}

await pool.end();
