import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

router.get('/departments', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT code, name FROM dane_departments ORDER BY name`
  );
  res.json(rows.map((r) => ({ code: r.code, name: r.name })));
});

router.get('/cities', async (req, res) => {
  const { department, q } = req.query;
  const values = [];
  let sql = `SELECT c.code, c.name, c.department_code AS "departmentCode", d.name AS "departmentName"
             FROM dane_cities c
             JOIN dane_departments d ON d.code = c.department_code
             WHERE 1=1`;

  if (department) {
    values.push(String(department).padStart(2, '0'));
    sql += ` AND c.department_code = $${values.length}`;
  }

  if (q) {
    values.push(`%${String(q).trim()}%`);
    sql += ` AND c.name ILIKE $${values.length}`;
  }

  sql += ' ORDER BY c.name LIMIT 500';

  const { rows } = await pool.query(sql, values);
  res.json(rows);
});

export default router;
