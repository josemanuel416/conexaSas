import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT 'NAS' AS kind, s.attempt_number, s.zip_file_name, s.is_success, s.status_code
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002'
  UNION ALL
  SELECT 'DS', s.attempt_number, s.zip_file_name, s.is_success, s.status_code
  FROM fcxp_dian_submissions s
  JOIN fcxp f ON f.id = s.fcxp_id
  WHERE f.cns_doc_soporte = 'SEDS984000000'
  ORDER BY kind, attempt_number
`);

console.table(rows);
await pool.end();
