import pg from 'pg';

const API = 'http://localhost:3500';
const INVOICE_ID = 'f496ebfe-f3e4-4ea8-b50f-d7db23787e30';

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.CONEXA_USER,
      password: process.env.CONEXA_PASS,
      companySlug: 'connetc-group-sas',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Login HTTP ${res.status}`);
  return data.token;
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:JUANMANUEL@localhost:5432/Conexa',
});

try {
  if (!process.env.CONEXA_USER || !process.env.CONEXA_PASS) {
    throw new Error('Defina CONEXA_USER y CONEXA_PASS');
  }
  const token = await login();
  const res = await fetch(`${API}/api/company/ventas/invoices/${INVOICE_ID}/send-dian`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  console.log('HTTP', res.status);
  console.log('status:', body.submission?.status, body.submission?.statusCode);
  console.log('message:', body.submission?.statusMessage);
  console.log('errors:', JSON.stringify(body.fePos?.errores || null));
  console.log('approved:', body.fePos?.aprobada);

  const { rows: subs } = await pool.query(
    `SELECT attempt_number, status, status_code, status_message, is_success
     FROM dian_submissions WHERE invoice_id = $1 ORDER BY attempt_number DESC LIMIT 1`,
    [INVOICE_ID]
  );
  console.log('last submission:', subs[0]);
} finally {
  await pool.end();
}
