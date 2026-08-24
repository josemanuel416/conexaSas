import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT s.attempt_number, s.status_message, s.response_xml,
         LEFT(s.request_xml, 8000) AS request_snip
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002'
  ORDER BY s.attempt_number DESC
  LIMIT 1
`);

const row = rows[0];
const resp = row.response_xml || '';
const errors = [...resp.matchAll(/Regla: ([^,]+), Rechazo: ([^"]+)/g)].map((m) => `${m[1]}: ${m[2]}`);
console.log('Attempt', row.attempt_number);
console.log('Message:', row.status_message);
console.log('Errors:', errors.length ? errors : resp.slice(0, 1500));

// Key XML fields
const xml = row.request_snip || '';
for (const tag of ['PayableAmount', 'TaxInclusiveAmount', 'ProfileID', 'CreditNoteTypeCode', 'ReferenceID', 'cbc:Note']) {
  const re = new RegExp(`<(?:cbc:)?${tag.replace('cbc:', '')}[^>]*>([^<]*)`, 'g');
  const matches = [...xml.matchAll(re)].map((m) => m[0]);
  if (matches.length) console.log(tag + ':', matches.slice(0, 5));
}

await pool.end();
