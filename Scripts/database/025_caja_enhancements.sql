-- ============================================================
-- Caja v2 — consecutivo por apertura, cierre con saldo, factura
-- ============================================================

ALTER TABLE cash_registers
  ADD COLUMN IF NOT EXISTS allow_close_with_balance BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cash_register_id UUID REFERENCES cash_registers(id) ON DELETE SET NULL;

ALTER TABLE cash_sessions
  ADD COLUMN IF NOT EXISTS session_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS closed_with_balance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carried_balance NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS balance_forwarded BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE cash_receipts
  ADD COLUMN IF NOT EXISTS receipt_kind VARCHAR(30) NOT NULL DEFAULT 'servicios',
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- Consecutivo de apertura para sesiones existentes
WITH numbered AS (
  SELECT id,
         'APC-' || LPAD(ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY opened_at)::text, 6, '0') AS num
  FROM cash_sessions
  WHERE session_number IS NULL
)
UPDATE cash_sessions s
SET session_number = n.num
FROM numbered n
WHERE s.id = n.id;

ALTER TABLE cash_sessions ALTER COLUMN session_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_number
  ON cash_sessions(company_id, session_number);

-- Permitir varias sesiones por día; solo una abierta por caja
ALTER TABLE cash_sessions
  DROP CONSTRAINT IF EXISTS cash_sessions_company_id_cash_register_id_session_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_one_open
  ON cash_sessions(cash_register_id)
  WHERE status = 'abierta';

CREATE INDEX IF NOT EXISTS idx_users_cash_register ON users(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_cash_receipts_invoice ON cash_receipts(invoice_id);

-- Permiso: cerrar sin egreso previo
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'caja.cerrar_con_saldo', 'Cerrar caja con saldo',
       'Permite cerrar la caja sin registrar egreso de caja', id, 86
FROM modules WHERE code = 'caja'
ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code = 'caja.cerrar_con_saldo'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
