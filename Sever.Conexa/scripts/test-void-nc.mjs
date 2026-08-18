/**
 * Prueba local de anulación → NC DIAN (solo dev).
 * Uso: node scripts/test-void-nc.mjs [invoiceId]
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { signToken } from '../src/middleware/auth.js';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const invoiceId = process.argv[2] || 'fda4e4ac-2178-4c0f-88c1-d63b51a4b195';
const companyId = '70ad39d6-00f2-406e-b1d7-2720c2630100';
const apiBase = `http://localhost:${process.env.PORT || 3500}`;

const { rows: users } = await pool.query(
  `SELECT id, email, role, company_id FROM users WHERE company_id = $1 AND role = 'company_admin' LIMIT 1`,
  [companyId]
);
if (!users[0]) throw new Error('Admin de compañía no encontrado');

const token = signToken({
  userId: users[0].id,
  email: users[0].email,
  role: users[0].role,
  companyId: users[0].company_id,
  permissions: ['*'],
});

const { rows: inv } = await pool.query(
  `SELECT full_number, status FROM invoices WHERE id = $1`,
  [invoiceId]
);
console.log(`Factura objetivo: ${inv[0]?.full_number} (${inv[0]?.status})`);

console.log('Enviando PATCH void...');
const resp = await fetch(`${apiBase}/api/company/ventas/invoices/${invoiceId}/void`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

const body = await resp.json();
console.log('HTTP', resp.status);
console.log(JSON.stringify(body, null, 2));

if (body.creditNote?.id) {
  const { rows: nc } = await pool.query(
    `SELECT credit_note_concept_code, credit_note_scope, full_number, status
     FROM invoices WHERE id = $1`,
    [body.creditNote.id]
  );
  console.log('NC en BD:', nc[0]);
}

await pool.end();
