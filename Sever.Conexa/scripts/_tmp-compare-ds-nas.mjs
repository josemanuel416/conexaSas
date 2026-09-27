import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

function parseErrors(raw) {
  try {
    const parsed = JSON.parse(raw);
    const strings = parsed?.SendBillSyncResult?.ErrorMessage?.string;
    return Array.isArray(strings) ? strings : strings ? [strings] : [];
  } catch {
    return [];
  }
}

for (const [kind, attempt] of [['DS', 1], ['DS', 3], ['NAS', 15]]) {
  const table = kind === 'DS' ? 'fcxp_dian_submissions' : 'fcxpdbcr_dian_submissions';
  const join = kind === 'DS'
    ? 'JOIN fcxp f ON f.id = s.fcxp_id WHERE f.cns_doc_soporte = \'SEDS984000000\''
    : 'JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id WHERE n.cns_doc_ajuste = \'SEDS984000002\'';
  const { rows } = await pool.query(`
    SELECT s.response_xml,
      (regexp_match(s.request_xml, '<cbc:ProfileID>([^<]*)</cbc:ProfileID>'))[1] AS profile,
      substring(s.request_xml from position('<cbc:UBLVersionID>' in s.request_xml) for 500) AS head
    FROM ${table} s ${join} AND s.attempt_number = $1
  `, [attempt]);
  const row = rows[0] || {};
  console.log(`\n=== ${kind} attempt ${attempt} ===`);
  console.log('ProfileID:', row.profile);
  console.log('Errors:', parseErrors(row.response_xml).slice(0, 8).join('\n  '));
}

await pool.end();
