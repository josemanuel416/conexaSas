-- Servicio asociado al recibo de caja
ALTER TABLE cash_receipts
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_receipts_service ON cash_receipts(service_id);
