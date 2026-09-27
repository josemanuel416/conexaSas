const API = process.env.API_URL || 'http://127.0.0.1:3504';
const email = process.env.TEST_EMAIL || 'admin@conexa.com';
const password = process.env.TEST_PASSWORD || 'Admin123!';

const loginRes = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const login = await loginRes.json();
if (!loginRes.ok) {
  console.error('Login failed', login);
  process.exit(1);
}

const token = login.token;
const fcxpId = '64d4ea4f-d848-4143-8ee8-f263525e227d';
const notaId = '70c17861-6075-4d1d-9810-cb97c82caa19';
const path = `/api/company/cuentas-pagar/${fcxpId}/notas/${notaId}/pdf?inline=1`;

const res = await fetch(`${API}${path}`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log('status', res.status);
console.log('content-type', res.headers.get('content-type'));
if (!res.ok) {
  console.log('body', await res.text());
} else {
  const buf = Buffer.from(await res.arrayBuffer());
  console.log('pdf bytes', buf.length);
}
