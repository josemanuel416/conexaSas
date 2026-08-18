import bcrypt from 'bcryptjs';
import { pool } from '../../db/pool.js';
import { normalizeEmail, normalizePassword } from '../../utils/normalize.js';

function formatUser(u) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    isActive: u.is_active,
    cashRegisterId: u.cash_register_id || null,
    cashRegisterName: u.cash_register_name || null,
    lastLogin: u.last_login,
    permissionCount: Number(u.permission_count) || 0,
    createdAt: u.created_at,
  };
}

export async function listPermissions(req, res) {
  const companyId = req.user.companyId;

  const { rows } = await pool.query(
    `SELECT p.id, p.code, p.name, p.description, p.sort_order,
            m.code AS module_code, m.name AS module_name, m.icon AS module_icon
     FROM permissions p
     LEFT JOIN modules m ON m.id = p.module_id
     WHERE p.is_active = true
       AND (
         p.module_id IS NULL
         OR p.module_id IN (
           SELECT cm.module_id FROM company_modules cm
           WHERE cm.company_id = $1 AND cm.is_enabled = true
         )
       )
     ORDER BY COALESCE(m.sort_order, 0), p.sort_order`,
    [companyId]
  );

  const grouped = {};
  const system = [];

  for (const p of rows) {
    const item = {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
    };

    if (!p.module_code) {
      system.push(item);
    } else {
      if (!grouped[p.module_code]) {
        grouped[p.module_code] = {
          code: p.module_code,
          name: p.module_name,
          icon: p.module_icon,
          permissions: [],
        };
      }
      grouped[p.module_code].permissions.push(item);
    }
  }

  res.json({ system, modules: Object.values(grouped) });
}

export async function listUsers(req, res) {
  const companyId = req.user.companyId;

  const { rows } = await pool.query(
    `SELECT u.*,
       cr.name AS cash_register_name,
       (SELECT COUNT(*) FROM user_permissions up WHERE up.user_id = u.id) AS permission_count
     FROM users u
     LEFT JOIN cash_registers cr ON cr.id = u.cash_register_id
     WHERE u.company_id = $1 AND u.role != 'super_admin'
     ORDER BY u.created_at DESC`,
    [companyId]
  );

  res.json(rows.map(formatUser));
}

export async function getUser(req, res) {
  const companyId = req.user.companyId;

  const { rows } = await pool.query(
    `SELECT u.*, cr.name AS cash_register_name
     FROM users u
     LEFT JOIN cash_registers cr ON cr.id = u.cash_register_id
     WHERE u.id = $1 AND u.company_id = $2`,
    [req.params.id, companyId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const permissions = await pool.query(
    `SELECT p.id, p.code, p.name, p.description, p.module_id
     FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = $1 AND up.company_id = $2
     ORDER BY p.sort_order`,
    [req.params.id, companyId]
  );

  res.json({
    ...formatUser(rows[0]),
    permissions: permissions.rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      moduleId: p.module_id,
    })),
  });
}

export async function createUser(req, res) {
  const companyId = req.user.companyId;
  const email = normalizeEmail(req.body.email);
  const password = normalizePassword(req.body.password);
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const { role, permissions } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
  }

  const userRole = role === 'company_admin' ? 'company_admin' : 'user';
  const cashRegisterId = req.body.cashRegisterId || null;

  if (cashRegisterId) {
    const { rows: regRows } = await pool.query(
      `SELECT id FROM cash_registers WHERE id = $1 AND company_id = $2 AND is_active = true`,
      [cashRegisterId, companyId],
    );
    if (!regRows[0]) {
      return res.status(400).json({ error: 'Caja asignada no válida' });
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await client.query(
      `INSERT INTO users (company_id, email, password_hash, full_name, role, cash_register_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [companyId, email, hash, fullName, userRole, cashRegisterId]
    );
    const user = rows[0];

    if (Array.isArray(permissions) && permissions.length > 0) {
      for (const permId of permissions) {
        await client.query(
          `INSERT INTO user_permissions (user_id, permission_id, company_id, granted_by)
           VALUES ($1, $2, $3, $4)`,
          [user.id, permId, companyId, req.user.userId]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(formatUser(user));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El email ya está registrado en esta compañía' });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateUser(req, res) {
  const companyId = req.user.companyId;
  const email = req.body.email !== undefined ? normalizeEmail(req.body.email) : undefined;
  const password =
    req.body.password !== undefined && req.body.password !== null && req.body.password !== ''
      ? normalizePassword(req.body.password)
      : null;
  const fullName =
    typeof req.body.fullName === 'string' ? req.body.fullName.trim() : undefined;
  const { role, isActive, cashRegisterId } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      `SELECT * FROM users WHERE id = $1 AND company_id = $2`,
      [req.params.id, companyId]
    );

    if (!existing[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const updates = [];
    const values = [];
    let i = 1;

    if (fullName) {
      updates.push(`full_name = $${i++}`);
      values.push(fullName);
    }
    if (email) {
      updates.push(`email = $${i++}`);
      values.push(email);
    }
    if (password) {
      if (password.length < 6) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
      }
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${i++}`);
      values.push(hash);
    }
    if (role) {
      updates.push(`role = $${i++}`);
      values.push(role === 'company_admin' ? 'company_admin' : 'user');
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${i++}`);
      values.push(isActive);
    }
    if (cashRegisterId !== undefined) {
      if (cashRegisterId) {
        const { rows: regRows } = await client.query(
          `SELECT id FROM cash_registers WHERE id = $1 AND company_id = $2 AND is_active = true`,
          [cashRegisterId, companyId],
        );
        if (!regRows[0]) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Caja asignada no válida' });
        }
      }
      updates.push(`cash_register_id = $${i++}`);
      values.push(cashRegisterId || null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(req.params.id);
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`,
        values
      );
    }

    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT u.*, cr.name AS cash_register_name
       FROM users u
       LEFT JOIN cash_registers cr ON cr.id = u.cash_register_id
       WHERE u.id = $1`,
      [req.params.id],
    );
    res.json(formatUser(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function updateUserPermissions(req, res) {
  const companyId = req.user.companyId;
  const { permissions } = req.body;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Se requiere un array de permisos' });
  }

  const { rows: userRows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND company_id = $2`,
    [req.params.id, companyId]
  );

  if (!userRows[0]) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM user_permissions WHERE user_id = $1 AND company_id = $2`,
      [req.params.id, companyId]
    );

    for (const permId of permissions) {
      const { rows: valid } = await client.query(
        `SELECT p.id FROM permissions p
         WHERE p.id = $1 AND p.is_active = true
           AND (
             p.module_id IS NULL
             OR p.module_id IN (
               SELECT cm.module_id FROM company_modules cm
               WHERE cm.company_id = $2 AND cm.is_enabled = true
             )
           )`,
        [permId, companyId]
      );

      if (valid[0]) {
        await client.query(
          `INSERT INTO user_permissions (user_id, permission_id, company_id, granted_by)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, permId, companyId, req.user.userId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Permisos actualizados' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
