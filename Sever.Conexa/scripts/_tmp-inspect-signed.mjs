import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT signed_xml, request_xml
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002' AND s.attempt_number = 15
`);

const xml = rows[0]?.signed_xml || '';
const matches = [...xml.matchAll(/<cbc:ProfileID>([^<]*)<\/cbc:ProfileID>/g)];
console.log('ProfileID occurrences:', matches.length);
matches.forEach((m, i) => console.log(i + 1, 'len', m[1].length, JSON.stringify(m[1].slice(0, 50))));

const root = xml.match(/<(\w+:)?(\w+)[\s>]/)?.[2];
console.log('Root element:', root);

const idx = xml.indexOf('<cbc:UBLVersionID>');
console.log('Order after IssueTime:', xml.slice(idx, idx + 1200));

const expected =
  'DIAN 2.1: Nota de ajuste al documento soporte en adquisiciones efectuadas a sujetos no obligados a expedir factura o documento equivalente ';
const profile = matches[0]?.[1] || '';
console.log('profile === expected:', profile === expected);
console.log('profile.includes(expected.trim()):', profile.includes(expected.trim()));

await pool.end();
