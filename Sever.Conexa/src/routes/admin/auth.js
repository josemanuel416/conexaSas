import bcrypt from 'bcryptjs';
import { pool } from '../../db/pool.js';
import { signToken } from '../../middleware/auth.js';
import { normalizeEmail, normalizePassword } from '../../utils/normalize.js';

export async function loginAdmin(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = normalizePassword(req.body.password);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  const { rows } = await pool.query(
    `SELECT id, email, password_hash, full_name, role
     FROM users WHERE email = $1 AND role = 'super_admin' AND is_active = true`,
    [email]
  );

  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [user.id]);

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    companyId: null,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  });
}

export async function getAdminProfile(req, res) {
  const { rows } = await pool.query(
    `SELECT id, email, full_name, role, last_login FROM users WHERE id = $1`,
    [req.user.userId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const u = rows[0];
  res.json({
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    lastLogin: u.last_login,
  });
}
