-- ============================================================
-- Impuestos contables — impuesto padre, clases y vigencias
-- ============================================================

-- Impuesto padre (codigo + nombre)
CREATE TABLE IF NOT EXISTS accounting_taxes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         VARCHAR(20) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  status       accounting_record_status NOT NULL DEFAULT 'activo',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_taxes_company
  ON accounting_taxes(company_id, code);

-- Clase de impuesto (codigo padre + clase + descripcion)
CREATE TABLE IF NOT EXISTS accounting_tax_classes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tax_id       UUID NOT NULL REFERENCES accounting_taxes(id) ON DELETE CASCADE,
  class_code   VARCHAR(20) NOT NULL,
  description  TEXT,
  status       accounting_record_status NOT NULL DEFAULT 'activo',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, tax_id, class_code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_classes_tax
  ON accounting_tax_classes(tax_id, class_code);

-- Vigencia de impuesto (tarifa por periodo)
CREATE TABLE IF NOT EXISTS accounting_tax_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tax_id         UUID NOT NULL REFERENCES accounting_taxes(id) ON DELETE CASCADE,
  tax_class_id   UUID NOT NULL REFERENCES accounting_tax_classes(id) ON DELETE CASCADE,
  rate_value     NUMERIC(10, 4) NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE,
  min_amount     NUMERIC(18, 2) NOT NULL DEFAULT 0,
  account_id     UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  status         accounting_record_status NOT NULL DEFAULT 'activo',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (rate_value >= 0),
  CHECK (min_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_rates_tax
  ON accounting_tax_rates(tax_id, tax_class_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_tax_rates_company
  ON accounting_tax_rates(company_id, start_date DESC);

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.impuestos', 'Impuestos', 'Gestionar impuestos, clases y vigencias', id, 38
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code = 'contabilidad.impuestos'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
