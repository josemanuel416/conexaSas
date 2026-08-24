import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT dr.document_type, dr.document_process, dr.dian_environment, dr.prefix, dr.resolution_number,
         c.nit, c.name, c.dian_test_set_id
  FROM dian_resolutions dr
  JOIN companies c ON c.id = dr.company_id
  WHERE dr.document_process = 'DS'
  ORDER BY dr.document_type
`);

console.table(rows);
await pool.end();
