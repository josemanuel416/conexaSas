import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa' });
const { rows } = await pool.query(`
  SELECT (regexp_match(request_xml, '<cbc:ProfileID>([^<]+)</cbc:ProfileID>'))[1] AS profile
  FROM fcxp_dian_submissions s JOIN fcxp f ON f.id=s.fcxp_id
  WHERE f.cns_doc_soporte='SEDS984000000' AND s.is_success=true ORDER BY s.attempt_number DESC LIMIT 1`);
console.log('DS approved ProfileID:', rows[0]?.profile);
await pool.end();
