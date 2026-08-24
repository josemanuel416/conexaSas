import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT n.id, n.fcxp_id, n.cns_doc_ajuste, n.status, f.company_id
  FROM fcxpdbcr n
  JOIN fcxp f ON f.id = n.fcxp_id
  WHERE n.cns_doc_ajuste IN ('SEDS984000001', 'SEDS984000002')
`);

console.log(rows);

const { rows: users } = await pool.query(`
  SELECT u.id, u.email, u.company_id
  FROM users u
  WHERE u.company_id IS NOT NULL
  LIMIT 5
`);
console.log('users', users);

await pool.end();
