import pg from 'pg';
import fs from 'fs';
import { buildFcxpNotaPdf, buildFcxpNotaPdfFileName } from '../src/utils/fcxp-nota-pdf.js';
import { loadNota } from '../src/utils/fcxp-notas.js';
import { clientFullNameExpr } from '../src/utils/client-format.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows: notaRows } = await pool.query(`
  SELECT n.id, n.fcxp_id, f.company_id
  FROM fcxpdbcr n
  JOIN fcxp f ON f.id = n.fcxp_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002'
  LIMIT 1
`);
if (!notaRows[0]) {
  console.error('Nota no encontrada');
  process.exit(1);
}

const { id: notaId, fcxp_id: fcxpId, company_id: companyId } = notaRows[0];
const nota = await loadNota(notaId, companyId);
const { rows: fcxpRows } = await pool.query(
  `SELECT f.*,
          ${clientFullNameExpr('c')} AS tercero_nombre,
          CONCAT(c.document_type, ' ', c.document_number) AS tercero_documento
   FROM fcxp f
   JOIN clients c ON c.id = f.id_tercero
   WHERE f.id = $1`,
  [fcxpId],
);
const f = fcxpRows[0];
const fcxp = {
  id: f.id,
  cnsFcxp: f.cns_fcxp,
  cnsDocSoporte: f.cns_doc_soporte,
  cude: f.cude,
  terceroNombre: f.tercero_nombre,
  terceroDocumento: f.tercero_documento,
};
const { rows: companyRows } = await pool.query(
  `SELECT name, nit, address, phone, logo_path, verification_digit,
          theme_primary, theme_secondary, theme_accent
   FROM companies WHERE id = $1`,
  [companyId],
);
const c = companyRows[0];
const { rows: subRows } = await pool.query(
  `SELECT signed_xml, dian_environment
   FROM fcxpdbcr_dian_submissions
   WHERE fcxpdbcr_id = $1 AND signed_xml IS NOT NULL
   ORDER BY is_success DESC NULLS LAST, created_at DESC
   LIMIT 1`,
  [notaId],
);

const buf = await buildFcxpNotaPdf({
  company: {
    name: c.name,
    nit: c.nit,
    address: c.address,
    phone: c.phone,
    logoPath: c.logo_path,
    verificationDigit: c.verification_digit,
    themePrimary: c.theme_primary,
    themeSecondary: c.theme_secondary,
    themeAccent: c.theme_accent,
  },
  fcxp,
  nota,
  printedBy: { email: 'test@test.com', fullName: 'Test' },
  signedXml: subRows[0]?.signed_xml || null,
  dianEnvironment: subRows[0]?.dian_environment || '',
});

const fileName = buildFcxpNotaPdfFileName(nota);
const out = new URL('./_tmp-nota-test.pdf', import.meta.url);
fs.writeFileSync(out, buf);
console.log('OK', fileName, buf.length, 'bytes');

await pool.end();
