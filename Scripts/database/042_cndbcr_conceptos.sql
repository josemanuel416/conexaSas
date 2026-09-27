-- Catálogo de conceptos de notas débito/crédito CxP (CNDBCR) homologados DIAN tipo 95

CREATE TABLE IF NOT EXISTS cndbcr (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  concepto      VARCHAR(20) NOT NULL,
  descripcion   TEXT NOT NULL,
  cuenta_conta  UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  dian_code     VARCHAR(2) NOT NULL CHECK (dian_code IN ('1', '2', '3', '4', '5')),
  status        VARCHAR(10) NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'inactivo')),
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, concepto)
);

CREATE INDEX IF NOT EXISTS idx_cndbcr_company ON cndbcr(company_id, sort_order, concepto);
CREATE INDEX IF NOT EXISTS idx_cndbcr_company_active ON cndbcr(company_id) WHERE status = 'activo';

ALTER TABLE fcxpdbcr
  ADD COLUMN IF NOT EXISTS cndbcr_id UUID REFERENCES cndbcr(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fcxpdbcr_cndbcr ON fcxpdbcr(cndbcr_id);

-- Conceptos DIAN 16.2.4 por defecto para cada compañía
INSERT INTO cndbcr (company_id, concepto, descripcion, dian_code, sort_order, status)
SELECT c.id, v.concepto, v.descripcion, v.dian_code, v.sort_order, 'activo'
FROM companies c
CROSS JOIN (
  VALUES
    ('01', 'Devolución parcial de bienes y/o no aceptación parcial del servicio', '1', 10),
    ('02', 'Anulación del documento soporte', '2', 20),
    ('03', 'Rebaja o descuento parcial o total', '3', 30),
    ('04', 'Ajuste de precio', '4', 40),
    ('05', 'Otros', '5', 50)
) AS v(concepto, descripcion, dian_code, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM cndbcr x WHERE x.company_id = c.id
);

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'cuentas_pagar.config', 'Configurar CxP', 'Administrar conceptos de notas débito/crédito', id, 7
FROM modules WHERE code = 'cuentas_pagar' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code = 'cuentas_pagar.config'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
