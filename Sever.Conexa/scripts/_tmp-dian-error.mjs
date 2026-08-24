import pg from 'pg';

const pool = new pg.Pool({ connectionString: 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa' });
const { rows } = await pool.query(`
  SELECT n.cns_doc_ajuste, n.status, n.est_dian, n.vlr_nota, n.vlr_iva, n.vlr_neto, n.afecta_iva, n.afecta_imp,
         s.attempt_number, s.status_message, s.response_xml
  FROM fcxpdbcr n
  JOIN fcxpdbcr_dian_submissions s ON s.fcxpdbcr_id = n.id
  WHERE n.status = 'rechazada_dian'
  ORDER BY s.created_at DESC
  LIMIT 1
`);
const row = rows[0];
if (!row) {
  console.log('No rejected submissions');
} else {
  console.log(JSON.stringify({
    ...row,
    response_xml: row.response_xml?.slice(0, 2000),
  }, null, 2));
}
await pool.end();
