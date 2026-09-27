import jwt from 'jsonwebtoken';
import fs from 'fs';

const secret = 'cambiar-este-secreto-en-produccion';
const token = jwt.sign({
  userId: '1c29fe57-051a-43b5-be71-5bc571513703',
  email: 'josemanueljb416@gmail.com',
  role: 'company_admin',
  companyId: '70ad39d6-00f2-406e-b1d7-2720c2630100',
}, secret, { expiresIn: '1h' });

const fcxpId = '64d4ea4f-d848-4143-8ee8-f263525e227d';
const notaId = '70c17861-6075-4d1d-9810-cb97c82caa19';
const path = `/api/company/cuentas-pagar/${fcxpId}/notas/${notaId}/pdf?inline=1`;

for (const port of [3500, 3504, 9500, 9501]) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const ct = res.headers.get('content-type') || '';
    let body = '';
    if (!res.ok) {
      body = ct.includes('json') ? JSON.stringify(await res.json()) : (await res.text()).slice(0, 120);
    } else {
      body = `pdf ${(await res.arrayBuffer()).byteLength} bytes`;
    }
    console.log(port, res.status, ct, body);
  } catch (e) {
    console.log(port, 'ERR', e.message);
  }
}
