-- ============================================================
-- Módulo Caja — cajas, sesiones, recibos y cierre diario
-- ============================================================

INSERT INTO modules (code, name, description, icon, sort_order) VALUES
  ('caja', 'Caja', 'Apertura, recibos, formas de pago y cierre diario', 'point_of_sale', 8)
ON CONFLICT (code) DO NOTHING;

-- Catálogo de cajas (puntos de cobro)
CREATE TABLE IF NOT EXISTS cash_registers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         VARCHAR(20) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_cash_registers_company ON cash_registers(company_id);

-- Sesión diaria: apertura y cierre por caja
CREATE TABLE IF NOT EXISTS cash_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cash_register_id UUID NOT NULL REFERENCES cash_registers(id),
  session_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  status           VARCHAR(20) NOT NULL DEFAULT 'abierta'
    CHECK (status IN ('abierta', 'cerrada')),
  opening_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_notes    TEXT,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by        UUID REFERENCES users(id),
  closed_at        TIMESTAMPTZ,
  closed_by        UUID REFERENCES users(id),
  closing_notes    TEXT,
  total_ingress    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_egress     NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_balance NUMERIC(14,2),
  counted_balance  NUMERIC(14,2),
  balance_difference NUMERIC(14,2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, cash_register_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_company_date ON cash_sessions(company_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_register ON cash_sessions(cash_register_id, status);

-- Recibos de caja con consecutivo
CREATE TABLE IF NOT EXISTS cash_receipts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cash_session_id  UUID NOT NULL REFERENCES cash_sessions(id),
  cash_register_id UUID NOT NULL REFERENCES cash_registers(id),
  receipt_number   VARCHAR(30) NOT NULL,
  receipt_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  movement_type    VARCHAR(20) NOT NULL CHECK (movement_type IN ('ingreso', 'egreso')),
  payment_method   VARCHAR(30) NOT NULL DEFAULT 'efectivo',
  concept          TEXT NOT NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  client_id        UUID REFERENCES clients(id),
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_cash_receipts_session ON cash_receipts(cash_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_receipts_company_date ON cash_receipts(company_id, receipt_date DESC);

-- Saldos por forma de pago al cierre
CREATE TABLE IF NOT EXISTS cash_session_payment_balances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id  UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  payment_method   VARCHAR(30) NOT NULL,
  expected_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  counted_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  difference       NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE(cash_session_id, payment_method)
);

-- Permisos del módulo
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'caja.acceso', 'Acceso a Caja', 'Ingresar al módulo de caja', id, 80
FROM modules WHERE code = 'caja' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'caja.configurar', 'Configurar cajas', 'Crear y editar puntos de caja', id, 81
FROM modules WHERE code = 'caja' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'caja.abrir', 'Abrir caja', 'Apertura de sesión diaria', id, 82
FROM modules WHERE code = 'caja' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'caja.registrar', 'Registrar recibos', 'Ingresos y egresos en caja', id, 83
FROM modules WHERE code = 'caja' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'caja.cerrar', 'Cerrar caja', 'Cierre diario y arqueo', id, 84
FROM modules WHERE code = 'caja' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'caja.ver_historial', 'Ver historial', 'Consultar sesiones y recibos cerrados', id, 85
FROM modules WHERE code = 'caja' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code LIKE 'caja.%'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
