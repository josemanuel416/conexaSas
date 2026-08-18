-- ============================================================
-- Permisos del sistema y asignación por usuario
-- ============================================================

CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(100) NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  module_id   INTEGER REFERENCES modules(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module_id);

-- Permisos asignados a cada usuario (por compañía)
CREATE TABLE IF NOT EXISTS user_permissions (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_company ON user_permissions(company_id);

-- ------------------------------------------------------------
-- Catálogo inicial de permisos (se irá ampliando)
-- ------------------------------------------------------------

-- Permisos del sistema / usuarios (sin módulo)
INSERT INTO permissions (code, name, description, module_id, sort_order) VALUES
  ('usuarios.ver',       'Ver usuarios',           'Listar usuarios de la compañía',              NULL, 1),
  ('usuarios.crear',     'Crear usuarios',         'Registrar nuevos usuarios',                   NULL, 2),
  ('usuarios.editar',    'Editar usuarios',        'Modificar datos de usuarios',                 NULL, 3),
  ('usuarios.permisos',  'Asignar permisos',       'Gestionar permisos de otros usuarios',        NULL, 4)
ON CONFLICT (code) DO NOTHING;

-- Permisos por módulo (acceso base + operaciones comunes)
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.acceso', 'Acceso a Ventas', 'Ingresar al módulo de ventas', id, 10 FROM modules WHERE code = 'ventas'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.crear', 'Crear ventas', 'Registrar ventas y cotizaciones', id, 11 FROM modules WHERE code = 'ventas'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.editar', 'Editar ventas', 'Modificar ventas existentes', id, 12 FROM modules WHERE code = 'ventas'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.acceso', 'Acceso a Inventario', 'Ingresar al módulo de inventario', id, 20 FROM modules WHERE code = 'inventario'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.crear', 'Crear productos', 'Registrar productos en inventario', id, 21 FROM modules WHERE code = 'inventario'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.editar', 'Editar inventario', 'Modificar productos y existencias', id, 22 FROM modules WHERE code = 'inventario'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.acceso', 'Acceso a Contabilidad', 'Ingresar al módulo contable', id, 30 FROM modules WHERE code = 'contabilidad'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'facturacion.acceso', 'Acceso a Facturación', 'Ingresar al módulo de facturación', id, 40 FROM modules WHERE code = 'facturacion'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'facturacion.emitir', 'Emitir facturas', 'Generar y enviar facturas electrónicas', id, 41 FROM modules WHERE code = 'facturacion'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'nomina.acceso', 'Acceso a Nómina', 'Ingresar al módulo de nómina', id, 50 FROM modules WHERE code = 'nomina'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'reportes.acceso', 'Acceso a Reportes', 'Ver reportes del sistema', id, 60 FROM modules WHERE code = 'reportes'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.acceso', 'Acceso a Agenda', 'Ingresar al módulo de agenda de citas', id, 70 FROM modules WHERE code = 'agenda_citas'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.crear', 'Crear citas', 'Programar nuevas citas', id, 71 FROM modules WHERE code = 'agenda_citas'
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.editar', 'Editar citas', 'Modificar o cancelar citas', id, 72 FROM modules WHERE code = 'agenda_citas'
ON CONFLICT (code) DO NOTHING;

-- El admin de compañía recibe todos los permisos de sus módulos activos
INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN company_modules cm ON cm.company_id = u.company_id AND cm.is_enabled = true
JOIN permissions p ON (p.module_id = cm.module_id OR p.module_id IS NULL)
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
