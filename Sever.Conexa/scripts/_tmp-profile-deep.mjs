import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const expected =
  'DIAN 2.1: Nota de ajuste al documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura o documento equivalente ';

const { rows } = await pool.query(`
  SELECT s.attempt_number,
    (regexp_match(s.signed_xml, '<cbc:ProfileID>([^<]*)</cbc:ProfileID>'))[1] AS profile,
    (regexp_match(s.signed_xml, '<cbc:CustomizationID>([^<]*)</cbc:CustomizationID>'))[1] AS customization,
    (regexp_match(s.signed_xml, '<cbc:ProfileExecutionID>([^<]*)</cbc:ProfileExecutionID>'))[1] AS profile_exec,
    (regexp_match(s.signed_xml, '<cbc:CreditNoteTypeCode>([^<]*)</cbc:CreditNoteTypeCode>'))[1] AS type_code,
    position('<cbc:ProfileID>' in s.signed_xml) AS pos_profile,
    substring(s.signed_xml from position('<cbc:UBLVersionID>' in s.signed_xml) for 600) AS head_snip
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002' AND s.attempt_number = 15
`);

const row = rows[0];
const profile = row.profile || '';
console.log('Attempt', row.attempt_number);
console.log('ProfileID len', profile.length, 'expected', expected.length);
console.log('Equal expected:', profile === expected);
console.log('Contains expected:', profile.includes(expected.trim()));
console.log('CustomizationID:', row.customization);
console.log('ProfileExecutionID:', row.profile_exec);
console.log('CreditNoteTypeCode:', row.type_code);
console.log('Last 5 char codes profile:', [...profile.slice(-5)].map((c) => c.charCodeAt(0)));
console.log('Last 5 char codes expected:', [...expected.slice(-5)].map((c) => c.charCodeAt(0)));
console.log('Head XML:\n', row.head_snip);

// compare char by char first diff
for (let i = 0; i < Math.max(profile.length, expected.length); i += 1) {
  if (profile[i] !== expected[i]) {
    console.log('First diff at', i, 'got', profile.charCodeAt(i), profile[i], 'exp', expected.charCodeAt(i), expected[i]);
    break;
  }
}

await pool.end();
