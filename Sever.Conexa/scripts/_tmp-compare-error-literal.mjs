import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

const { rows } = await pool.query(`
  SELECT s.response_xml,
    (regexp_match(s.signed_xml, '<cbc:ProfileID>([^<]*)</cbc:ProfileID>'))[1] AS profile
  FROM fcxpdbcr_dian_submissions s
  JOIN fcxpdbcr n ON n.id = s.fcxpdbcr_id
  WHERE n.cns_doc_ajuste = 'SEDS984000002' AND s.attempt_number = 15
`);

const raw = rows[0]?.response_xml || '';
const profile = rows[0]?.profile || '';
let errors = [];
try {
  const parsed = JSON.parse(raw);
  const strings = parsed?.SendBillSyncResult?.ErrorMessage?.string;
  errors = Array.isArray(strings) ? strings : strings ? [strings] : [];
} catch {
  errors = [...raw.matchAll(/Regla: ([^,]+), (Rechazo|Notificación): ([^\n"]+)/g)].map((m) => m[3]);
}

const nsad03 = errors.find((e) => e.includes('NSAD03') || e.includes('ProfileID'));
console.log('NSAD03 msg:', nsad03);

const m = nsad03?.match(/literal [“"]([^”"]+)[”"]/);
const literalFromError = m?.[1] || '';
console.log('Literal from error len:', literalFromError.length);
console.log('Profile len:', profile.length);
console.log('profile === literalFromError:', profile === literalFromError);
console.log('profile.includes(literalFromError):', profile.includes(literalFromError));
console.log('literalFromError.includes(profile):', literalFromError.includes(profile));

for (let i = 0; i < Math.max(profile.length, literalFromError.length); i += 1) {
  if (profile[i] !== literalFromError[i]) {
    console.log('Diff at', i, 'profile', profile.charCodeAt(i), JSON.stringify(profile[i]), 'error', literalFromError.charCodeAt(i), JSON.stringify(literalFromError[i]));
    break;
  }
}

await pool.end();
