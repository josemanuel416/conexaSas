import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT s.attempt_number, s.created_at, s.status, s.status_message,
         LEFT(COALESCE(s.response_xml, ''), 300) AS response_snip
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002'
  ORDER BY s.attempt_number DESC
  LIMIT 5
`);

console.log(JSON.stringify(rows, null, 2));
await pool.end();
