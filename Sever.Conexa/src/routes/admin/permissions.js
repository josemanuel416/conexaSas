import { pool } from '../../db/pool.js';

function formatPermission(p) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    moduleId: p.module_id,
    moduleCode: p.module_code,
    moduleName: p.module_name,
    moduleIcon: p.module_icon,
    sortOrder: p.sort_order,
    isActive: p.is_active,
    userCount: Number(p.user_count) || 0,
    createdAt: p.created_at,
  };
}

function validatePermissionCode(code, moduleCode) {
  if (!code || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(code)) {
    return 'El código debe usar formato: modulo.accion (solo minúsculas, números y guión bajo)';
  }

  if (moduleCode && !code.startsWith(`${moduleCode}.`)) {
    return `El código debe comenzar con "${moduleCode}." para este módulo`;
  }

  if (!moduleCode && code.includes('.')) {
    const prefix = code.split('.')[0];
    if (prefix !== 'usuarios' && prefix !== 'sistema') {
      return 'Permisos de sistema deben usar prefijo "usuarios." o "sistema."';
    }
  }

  return null;
}

export async function listAllPermissions(req, res) {
  const { rows } = await pool.query(
    `SELECT p.*, m.code AS module_code, m.name AS module_name, m.icon AS module_icon,
       (SELECT COUNT(*) FROM user_permissions up WHERE up.permission_id = p.id) AS user_count
     FROM permissions p
     LEFT JOIN modules m ON m.id = p.module_id
     ORDER BY COALESCE(m.sort_order, 0), p.sort_order, p.code`
  );

  const permissions = rows.map(formatPermission);

  const grouped = {
    system: permissions.filter((p) => !p.moduleId),
    modules: {},
  };

  for (const p of permissions.filter((perm) => perm.moduleId)) {
    if (!grouped.modules[p.moduleCode]) {
      grouped.modules[p.moduleCode] = {
        code: p.moduleCode,
        name: p.moduleName,
        icon: p.moduleIcon,
        permissions: [],
      };
    }
    grouped.modules[p.moduleCode].permissions.push(p);
  }

  res.json({
    permissions,
    grouped: {
      system: grouped.system,
      modules: Object.values(grouped.modules),
    },
    stats: {
      total: permissions.length,
      active: permissions.filter((p) => p.isActive).length,
      byModule: Object.keys(grouped.modules).length,
    },
  });
}

export async function createPermission(req, res) {
  const { code, name, description, moduleId, sortOrder, isActive } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Código y nombre son requeridos' });
  }

  let moduleCode = null;
  if (moduleId) {
    const { rows } = await pool.query(
      `SELECT code FROM modules WHERE id = $1 AND is_active = true`,
      [moduleId]
    );
    if (!rows[0]) {
      return res.status(400).json({ error: 'Módulo no válido' });
    }
    moduleCode = rows[0].code;
  }

  const codeError = validatePermissionCode(code.toLowerCase(), moduleCode);
  if (codeError) {
    return res.status(400).json({ error: codeError });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO permissions (code, name, description, module_id, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        code.toLowerCase(),
        name,
        description || null,
        moduleId || null,
        sortOrder ?? 0,
        isActive ?? true,
      ]
    );

    const full = await pool.query(
      `SELECT p.*, m.code AS module_code, m.name AS module_name, m.icon AS module_icon
       FROM permissions p
       LEFT JOIN modules m ON m.id = p.module_id
       WHERE p.id = $1`,
      [rows[0].id]
    );

    res.status(201).json(formatPermission({ ...full.rows[0], user_count: 0 }));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código de permiso ya existe' });
    }
    throw err;
  }
}

export async function updatePermission(req, res) {
  const { name, description, sortOrder, isActive } = req.body;

  const { rows } = await pool.query(
    `UPDATE permissions
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         sort_order = COALESCE($3, sort_order),
         is_active = COALESCE($4, is_active)
     WHERE id = $5
     RETURNING *`,
    [name, description, sortOrder, isActive, req.params.id]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const full = await pool.query(
    `SELECT p.*, m.code AS module_code, m.name AS module_name, m.icon AS module_icon,
       (SELECT COUNT(*) FROM user_permissions up WHERE up.permission_id = p.id) AS user_count
     FROM permissions p
     LEFT JOIN modules m ON m.id = p.module_id
     WHERE p.id = $1`,
    [req.params.id]
  );

  res.json(formatPermission(full.rows[0]));
}

export async function validatePermissionCodeEndpoint(req, res) {
  const { code, moduleId } = req.body;

  if (!code) {
    return res.status(400).json({ valid: false, error: 'Código requerido' });
  }

  let moduleCode = null;
  if (moduleId) {
    const { rows } = await pool.query(`SELECT code FROM modules WHERE id = $1`, [moduleId]);
    if (!rows[0]) {
      return res.json({ valid: false, error: 'Módulo no válido' });
    }
    moduleCode = rows[0].code;
  }

  const formatError = validatePermissionCode(code.toLowerCase(), moduleCode);
  if (formatError) {
    return res.json({ valid: false, error: formatError });
  }

  const { rows } = await pool.query(`SELECT id FROM permissions WHERE code = $1`, [
    code.toLowerCase(),
  ]);

  if (rows[0]) {
    return res.json({ valid: false, error: 'Este código ya está registrado' });
  }

  res.json({ valid: true, suggestedCode: moduleCode ? `${moduleCode}.` : null });
}
