-- Variables de configuración por compañía (extensible)

CREATE TABLE IF NOT EXISTS company_system_variables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  var_key       VARCHAR(60) NOT NULL,
  var_value     TEXT NOT NULL DEFAULT '',
  label         VARCHAR(120) NOT NULL,
  description   TEXT,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  is_editable   BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, var_key)
);

CREATE INDEX IF NOT EXISTS idx_company_system_variables_company ON company_system_variables(company_id);

-- Valores iniciales para compañías existentes
INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'services.code_prefix',
  'SRV',
  'Prefijo código de servicios',
  'Prefijo para códigos automáticos de servicios. Ejemplo: SRV → SRV0001, SRV0002',
  10
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.variables', 'Variables del sistema', 'Configurar variables generales de ventas', id, 22
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code = 'ventas.variables'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
