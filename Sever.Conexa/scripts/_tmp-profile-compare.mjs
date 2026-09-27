import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT
    (regexp_match(request_xml, '<cbc:ProfileID>([^<]+)</cbc:ProfileID>'))[1] AS req_profile,
    (regexp_match(signed_xml, '<cbc:ProfileID>([^<]+)</cbc:ProfileID>'))[1] AS signed_profile
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002' AND s.attempt_number = 8
`);

const expected =
  'Nota de ajuste al documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura o documento equivalente';

const { req_profile: req, signed_profile: signed } = rows[0] || {};
console.log('req === expected:', req === expected);
console.log('signed === expected:', signed === expected);
console.log('req === signed:', req === signed);
console.log('req len/signed len:', req?.length, signed?.length);

function codes(s) {
  return [...(s || '')].slice(-5).map((c) => c.charCodeAt(0));
}
console.log('last char codes req/signed:', codes(req), codes(signed));

await pool.end();
