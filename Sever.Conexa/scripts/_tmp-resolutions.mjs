import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa' });
const { rows } = await pool.query(`
  SELECT id, document_type, document_process, dian_environment, prefix, is_active, resolution_number
  FROM dian_resolutions
  WHERE document_process = 'DS' OR document_type IN ('05','95')
  ORDER BY document_type, is_active DESC`);
console.table(rows);
await pool.end();
