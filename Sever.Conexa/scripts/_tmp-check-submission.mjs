import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT s.attempt_number, s.created_at, s.status,
         POSITION('DiscrepancyResponse' IN s.request_xml) AS pos_disc,
         POSITION('BillingReference' IN s.request_xml) AS pos_bill,
         POSITION('<cbc:Note>' IN s.request_xml) AS pos_note,
         (regexp_match(s.request_xml, 'PayableAmount[^>]*>([^<]+)'))[1] AS payable,
         (regexp_match(s.request_xml, 'TaxInclusiveAmount[^>]*>([^<]+)'))[1] AS tax_inc,
         (regexp_match(s.request_xml, '<cbc:ProfileID>([^<]+)</cbc:ProfileID>'))[1] AS profile_id,
         LENGTH(s.request_xml) AS xml_len
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002'
  ORDER BY s.attempt_number DESC
  LIMIT 5
`);

console.log(JSON.stringify(rows, null, 2));

const latest = await pool.query(`
  SELECT s.request_xml
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002'
  ORDER BY s.attempt_number DESC
  LIMIT 1
`);

if (latest.rows[0]?.request_xml) {
  const xml = latest.rows[0].request_xml;
  const start = xml.indexOf('CreditNoteTypeCode');
  console.log('\n--- XML section ---\n');
  console.log(xml.slice(start, start + 1500));
}

await pool.end();
