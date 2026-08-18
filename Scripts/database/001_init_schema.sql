-- ============================================================
-- ErpConexa - Esquema inicial multi-compañía
-- Base de datos: PostgreSQL
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- Compañías (tenants)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  nit         VARCHAR(20)  NOT NULL UNIQUE,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  email       VARCHAR(255),
  phone       VARCHAR(50),
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);

-- ------------------------------------------------------------
-- Catálogo de módulos del ERP
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  icon        VARCHAR(50),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Módulos habilitados por compañía (según contrato)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_modules (
  id             SERIAL PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_id      INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_enabled     BOOLEAN NOT NULL DEFAULT true,
  contract_start DATE,
  contract_end   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_company_modules_company ON company_modules(company_id);

-- ------------------------------------------------------------
-- Usuarios del sistema
-- super_admin: company_id = NULL (panel administrativo)
-- company_admin / user: pertenecen a una compañía
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'company_admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_email
  ON users(company_id, email) WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_super_admin_email
  ON users(email) WHERE role = 'super_admin';

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- ------------------------------------------------------------
-- Módulos base del ERP
-- ------------------------------------------------------------
INSERT INTO modules (code, name, description, icon, sort_order) VALUES
  ('ventas',       'Ventas',        'Gestión de ventas y cotizaciones',       'shopping_cart', 1),
  ('inventario',   'Inventario',    'Control de productos y existencias',     'inventory_2',   2),
  ('contabilidad', 'Contabilidad',  'Libros contables y asientos',            'account_balance', 3),
  ('facturacion',  'Facturación',   'Facturación electrónica DIAN',           'receipt_long',  4),
  ('nomina',       'Nómina',        'Gestión de empleados y pagos',           'groups',        5),
  ('reportes',     'Reportes',      'Reportes y análisis de negocio',         'bar_chart',     6),
  ('agenda_citas', 'Agenda de citas', 'Programación y gestión de citas',    'event',         7)
ON CONFLICT (code) DO NOTHING;
