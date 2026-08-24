import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT s.attempt_number, s.response_xml
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002' AND s.attempt_number = 8
`);

const raw = rows[0]?.response_xml || '';
let errors = [];
try {
  const parsed = JSON.parse(raw);
  const strings = parsed?.SendBillSyncResult?.ErrorMessage?.string;
  errors = Array.isArray(strings) ? strings : strings ? [strings] : [];
} catch {
  errors = [...raw.matchAll(/Regla: ([^,]+), Rechazo: ([^\n"]+)/g)].map((m) => `${m[1]}: ${m[2]}`);
}

console.log('Attempt 7 errors:', errors.length);
errors.forEach((e, i) => console.log(`${i + 1}. ${e}`));

await pool.end();
