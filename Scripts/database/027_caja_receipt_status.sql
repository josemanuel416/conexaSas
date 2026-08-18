-- Estado del recibo: borrador → confirmado | descartado; confirmado → anulado
ALTER TABLE cash_receipts
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('borrador', 'confirmado', 'anulado', 'descartado')),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id);

-- Recibos existentes quedan confirmados
UPDATE cash_receipts SET status = 'confirmado' WHERE status IS NULL;

ALTER TABLE cash_receipts ALTER COLUMN status SET DEFAULT 'borrador';

CREATE INDEX IF NOT EXISTS idx_cash_receipts_status ON cash_receipts(cash_session_id, status);
