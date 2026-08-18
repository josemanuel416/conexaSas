/** Reenvía una NC existente a DIAN (solo dev). Uso: node scripts/test-send-nc.mjs [creditNoteId] */
import dotenv from 'dotenv';
import pg from 'pg';
import { signToken } from '../src/middleware/auth.js';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const creditNoteId = process.argv[2] || 'ed397583-92d2-480f-8dc0-ee9d11ae342d';
const companyId = '70ad39d6-00f2-406e-b1d7-2720c2630100';
const apiBase = `http://localhost:${process.env.PORT || 3500}`;

const { rows: users } = await pool.query(
  `SELECT id, email, role, company_id FROM users WHERE company_id = $1 AND role = 'company_admin' LIMIT 1`,
  [companyId]
);

const token = signToken({
  userId: users[0].id,
  email: users[0].email,
  role: users[0].role,
  companyId: users[0].company_id,
  permissions: ['*'],
});

const { rows: nc } = await pool.query(
  `SELECT full_number, status, credit_note_concept_code FROM invoices WHERE id = $1`,
  [creditNoteId]
);
console.log(`NC: ${nc[0]?.full_number} (${nc[0]?.status}) concepto=${nc[0]?.credit_note_concept_code}`);

const resp = await fetch(`${apiBase}/api/company/ventas/invoices/${creditNoteId}/send-dian`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});

const body = await resp.json();
console.log('HTTP', resp.status);
console.log(JSON.stringify({
  message: body.message || body.error,
  approved: body.approved,
  pending: body.pending,
  statusCode: body.submission?.statusCode || body.fePos?.codigo,
  errors: body.fePos?.errores?.string || body.fePos?.mensaje,
}, null, 2));

await pool.end();
