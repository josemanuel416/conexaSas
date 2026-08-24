import pg from 'pg';
import fs from 'fs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

async function dump(kind, attempt, outFile) {
  const table = kind === 'DS' ? 'fcxp_dian_submissions' : 'fcxpdbcr_dian_submissions';
  const join = kind === 'DS'
    ? 'JOIN fcxp f ON f.id = s.fcxp_id WHERE f.cns_doc_soporte = \'SEDS984000000\''
    : 'JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id WHERE n.cns_doc_ajuste = \'SEDS984000002\'';
  const { rows } = await pool.query(`
    SELECT s.signed_xml FROM ${table} s ${join} AND s.attempt_number = $1
  `, [attempt]);
  fs.writeFileSync(outFile, rows[0]?.signed_xml || '', 'utf8');
  console.log('Wrote', outFile, rows[0]?.signed_xml?.length || 0);
}

await dump('DS', 3, 'c:/DevConexa/Sever.Conexa/scripts/_tmp-ds-approved.xml');
await dump('NAS', 15, 'c:/DevConexa/Sever.Conexa/scripts/_tmp-nas-rejected.xml');
await pool.end();
