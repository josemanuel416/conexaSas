-- ============================================================
-- Módulo Contabilidad — plan de cuentas, comprobantes,
-- centros de costo, periodos, movimientos y saldos de cierre
-- ============================================================

DO $$ BEGIN
  CREATE TYPE accounting_account_type AS ENUM ('suma', 'detalle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE accounting_account_class AS ENUM ('cxc', 'cxp', 'otros');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE accounting_record_status AS ENUM ('activo', 'inactivo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE accounting_period_status AS ENUM ('abierto', 'cerrado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE accounting_journal_status AS ENUM ('borrador', 'contabilizado', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE accounting_line_type AS ENUM ('db', 'cr');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE accounting_journal_source AS ENUM (
    'manual', 'ventas', 'caja', 'inventario', 'nomina', 'importacion', 'otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- Plan de cuentas (PUC por compañía)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                  VARCHAR(20) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  account_type          accounting_account_type NOT NULL,
  parent_account_id     UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  account_class         accounting_account_class NOT NULL DEFAULT 'otros',
  status                accounting_record_status NOT NULL DEFAULT 'activo',
  requires_third_party    BOOLEAN NOT NULL DEFAULT false,
  requires_tax            BOOLEAN NOT NULL DEFAULT false,
  tax_code                VARCHAR(20),
  requires_invoice        BOOLEAN NOT NULL DEFAULT false,
  requires_cost_center    BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_accounts_company
  ON accounting_accounts(company_id, code);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_parent
  ON accounting_accounts(parent_account_id);

-- ------------------------------------------------------------
-- Tipos de comprobante contable
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_voucher_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         VARCHAR(10) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  status       accounting_record_status NOT NULL DEFAULT 'activo',
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_voucher_types_company
  ON accounting_voucher_types(company_id, sort_order);

-- Consecutivo de referencia por tipo de comprobante
CREATE TABLE IF NOT EXISTS accounting_voucher_type_sequences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voucher_type_id  UUID NOT NULL REFERENCES accounting_voucher_types(id) ON DELETE CASCADE,
  last_reference   BIGINT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(voucher_type_id)
);

-- Consecutivo global de nro comprobante por compañía
CREATE TABLE IF NOT EXISTS accounting_journal_sequences (
  company_id           UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last_voucher_number  BIGINT NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Centros de costo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_cost_centers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         VARCHAR(20) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  status       accounting_record_status NOT NULL DEFAULT 'activo',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_cost_centers_company
  ON accounting_cost_centers(company_id, code);

-- ------------------------------------------------------------
-- Periodos contables (año / mes)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_periods (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year         SMALLINT NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month        SMALLINT NOT NULL CHECK (month >= 1 AND month <= 12),
  year_month   INTEGER NOT NULL,
  status       accounting_period_status NOT NULL DEFAULT 'abierto',
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, year_month),
  CHECK (year_month = year * 100 + month)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_company
  ON accounting_periods(company_id, year_month DESC);

-- ------------------------------------------------------------
-- Movimiento contable (cabecera / padre)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_journal_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voucher_number   BIGINT NOT NULL,
  accounting_date  DATE NOT NULL,
  year_month       INTEGER NOT NULL,
  voucher_type_id  UUID NOT NULL REFERENCES accounting_voucher_types(id),
  type_reference   BIGINT NOT NULL,
  description      TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  total_debit      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_credit     NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status           accounting_journal_status NOT NULL DEFAULT 'borrador',
  source           accounting_journal_source NOT NULL DEFAULT 'manual',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, voucher_number),
  UNIQUE(company_id, voucher_type_id, type_reference)
);

CREATE INDEX IF NOT EXISTS idx_accounting_journal_entries_company
  ON accounting_journal_entries(company_id, year_month DESC, accounting_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_entries_type
  ON accounting_journal_entries(voucher_type_id, type_reference);

-- ------------------------------------------------------------
-- Movimiento contable (detalle)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_journal_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE CASCADE,
  line_number      SMALLINT NOT NULL,
  account_id       UUID NOT NULL REFERENCES accounting_accounts(id),
  third_party_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  cost_center_id   UUID REFERENCES accounting_cost_centers(id) ON DELETE SET NULL,
  line_type        accounting_line_type NOT NULL,
  invoice_number   VARCHAR(50),
  reference        VARCHAR(100),
  tax_base         NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(18, 2) NOT NULL DEFAULT 0,
  amount           NUMERIC(18, 2) NOT NULL,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(journal_entry_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_accounting_journal_lines_entry
  ON accounting_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_accounting_journal_lines_account
  ON accounting_journal_lines(account_id);

-- ------------------------------------------------------------
-- Saldos de cierre — mes (cuenta)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_balance_month (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id        UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
  year_month       INTEGER NOT NULL,
  account_id       UUID NOT NULL REFERENCES accounting_accounts(id),
  account_code     VARCHAR(20) NOT NULL,
  account_name     VARCHAR(255) NOT NULL,
  opening_balance  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  debit            NUMERIC(18, 2) NOT NULL DEFAULT 0,
  credit           NUMERIC(18, 2) NOT NULL DEFAULT 0,
  closing_balance  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, year_month, account_id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_balance_month_period
  ON accounting_balance_month(period_id, account_code);

-- ------------------------------------------------------------
-- Saldos de cierre — mes + tercero
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_balance_third_party (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id          UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
  year_month         INTEGER NOT NULL,
  account_id         UUID NOT NULL REFERENCES accounting_accounts(id),
  account_code       VARCHAR(20) NOT NULL,
  account_name       VARCHAR(255) NOT NULL,
  third_party_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  third_party_name   VARCHAR(255),
  opening_balance    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  debit              NUMERIC(18, 2) NOT NULL DEFAULT 0,
  credit             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  closing_balance    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, year_month, account_id, third_party_id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_balance_third_party_period
  ON accounting_balance_third_party(period_id, account_code);

-- ------------------------------------------------------------
-- Saldos de cierre — mes + tercero + factura + centro costo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_balance_third_party_invoice (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id          UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
  year_month         INTEGER NOT NULL,
  account_id         UUID NOT NULL REFERENCES accounting_accounts(id),
  account_code       VARCHAR(20) NOT NULL,
  account_name       VARCHAR(255) NOT NULL,
  third_party_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  third_party_name   VARCHAR(255),
  cost_center_id     UUID REFERENCES accounting_cost_centers(id) ON DELETE SET NULL,
  cost_center_code   VARCHAR(20),
  invoice_number     VARCHAR(50) NOT NULL DEFAULT '',
  opening_balance    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  debit              NUMERIC(18, 2) NOT NULL DEFAULT 0,
  credit             NUMERIC(18, 2) NOT NULL DEFAULT 0,
  closing_balance    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, year_month, account_id, third_party_id, cost_center_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_accounting_balance_tpi_period
  ON accounting_balance_third_party_invoice(period_id, account_code);

-- ------------------------------------------------------------
-- Seed tipos de comprobante por compañía
-- ------------------------------------------------------------
INSERT INTO accounting_voucher_types (company_id, code, name, description, sort_order)
SELECT c.id, v.code, v.name, v.description, v.sort_order
FROM companies c
CROSS JOIN (
  VALUES
    ('RC', 'Recibo de caja', 'Ingresos de efectivo y recaudos', 1),
    ('CE', 'Comprobante de egreso', 'Pagos y salidas de efectivo', 2),
    ('FV', 'Factura de venta', 'Facturación de venta', 3),
    ('NC', 'Nota crédito', 'Notas crédito a clientes', 4),
    ('ND', 'Nota débito', 'Notas débito a clientes', 5),
    ('CC', 'Comprobante contable', 'Asientos contables generales', 6),
    ('AJ', 'Ajuste contable', 'Ajustes y reclasificaciones', 7)
) AS v(code, name, description, sort_order)
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO accounting_voucher_type_sequences (company_id, voucher_type_id, last_reference)
SELECT vt.company_id, vt.id, 0
FROM accounting_voucher_types vt
LEFT JOIN accounting_voucher_type_sequences s ON s.voucher_type_id = vt.id
WHERE s.id IS NULL;

INSERT INTO accounting_journal_sequences (company_id, last_voucher_number)
SELECT c.id, 0
FROM companies c
ON CONFLICT (company_id) DO NOTHING;

-- Periodo actual abierto por compañía
INSERT INTO accounting_periods (company_id, year, month, year_month, status, description)
SELECT
  c.id,
  EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT,
  EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT,
  (EXTRACT(YEAR FROM CURRENT_DATE)::INT * 100 + EXTRACT(MONTH FROM CURRENT_DATE)::INT),
  'abierto',
  'Periodo inicial'
FROM companies c
ON CONFLICT (company_id, year_month) DO NOTHING;

-- Permisos contabilidad
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.configurar', 'Configuración contable', 'Acceso a configuración del módulo contable', id, 31
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.cuentas', 'Plan de cuentas', 'Gestionar plan de cuentas (PUC)', id, 32
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.comprobantes', 'Tipos de comprobante', 'Gestionar tipos de comprobante contable', id, 33
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.centros_costo', 'Centros de costo', 'Gestionar centros de costo', id, 34
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.periodos', 'Periodos contables', 'Gestionar periodos contables', id, 35
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.movimientos', 'Movimientos contables', 'Crear y editar comprobantes contables', id, 36
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'contabilidad.cerrar', 'Cierre contable', 'Cierre de periodos y generación de saldos', id, 37
FROM modules WHERE code = 'contabilidad' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code LIKE 'contabilidad.%'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
