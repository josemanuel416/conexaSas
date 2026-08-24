/** Dev: reenvía nota CxP a DIAN. Uso: PORT=3504 node scripts/_tmp-send-nota.mjs */
import dotenv from 'dotenv';
import pg from 'pg';
import { signToken } from '../src/middleware/auth.js';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const cns = process.argv[2] || 'SEDS984000002';
const fcxpId = process.argv[3] || '64d4ea4f-d848-4143-8ee8-f263525e227d';
const apiBase = `http://localhost:${process.env.PORT || 3504}`;

const { rows: notas } = await pool.query(
  `SELECT id, company_id, cns_doc_ajuste, status, est_dian
   FROM fcxpdbcr WHERE cns_doc_ajuste = $1`,
  [cns]
);
if (!notas.length) {
  console.error('Nota no encontrada:', cns);
  process.exit(1);
}
const nota = notas[0];

const { rows: users } = await pool.query(
  `SELECT id, email, role, company_id FROM users
   WHERE company_id = $1 AND role = 'company_admin' LIMIT 1`,
  [nota.company_id]
);
if (!users.length) {
  console.error('Sin company_admin para', nota.company_id);
  process.exit(1);
}

const token = signToken({
  userId: users[0].id,
  email: users[0].email,
  role: users[0].role,
  companyId: users[0].company_id,
  permissions: ['*'],
});

console.log(`Nota ${nota.cns_doc_ajuste} (${nota.status}/${nota.est_dian}) -> ${apiBase}`);

const resp = await fetch(`${apiBase}/api/company/cuentas-pagar/${fcxpId}/notas/${nota.id}/send-dian`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});

const body = await resp.json();
console.log('HTTP', resp.status);
console.log(JSON.stringify(body, null, 2));

await pool.end();
