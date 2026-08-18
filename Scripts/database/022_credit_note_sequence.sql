-- Secuencia de nota crédito por factura origen (permite varias NC parciales)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credit_note_sequence INTEGER;

CREATE INDEX IF NOT EXISTS idx_invoices_credit_note_sequence
  ON invoices(source_invoice_id, credit_note_sequence)
  WHERE document_kind = 'nota_credito';

COMMENT ON COLUMN invoices.credit_note_sequence IS
  'Orden de la NC respecto a la factura origen (1, 2, 3…). El consecutivo DIAN sigue en full_number/consecutive_number.';

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY source_invoice_id ORDER BY created_at) AS seq
  FROM invoices
  WHERE document_kind = 'nota_credito'
    AND source_invoice_id IS NOT NULL
    AND credit_note_sequence IS NULL
)
UPDATE invoices i
SET credit_note_sequence = ranked.seq
FROM ranked
WHERE i.id = ranked.id;
