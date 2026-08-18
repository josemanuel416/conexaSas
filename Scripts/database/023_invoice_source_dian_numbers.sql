-- Snapshot de numeración DIAN de la factura origen (para notas crédito)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_invoice_prefix VARCHAR(10),
  ADD COLUMN IF NOT EXISTS source_invoice_consecutive BIGINT,
  ADD COLUMN IF NOT EXISTS source_invoice_full_number VARCHAR(30);

UPDATE invoices nc
SET
  source_invoice_prefix = src.prefix,
  source_invoice_consecutive = src.consecutive_number,
  source_invoice_full_number = src.full_number
FROM invoices src
WHERE nc.source_invoice_id = src.id
  AND nc.document_kind = 'nota_credito'
  AND nc.source_invoice_prefix IS NULL;

UPDATE invoices
SET
  prefix = upper(regexp_replace(full_number, '\d+$', '')),
  consecutive_number = NULLIF(regexp_replace(full_number, '^[^0-9]+', ''), full_number)::bigint
WHERE document_kind = 'factura'
  AND full_number ~ '^[A-Z]+[0-9]+$'
  AND (prefix IS NULL OR consecutive_number IS NULL);

COMMENT ON COLUMN invoices.source_invoice_prefix IS
  'Prefijo DIAN de la factura origen (snapshot al crear la NC).';
COMMENT ON COLUMN invoices.source_invoice_consecutive IS
  'Consecutivo DIAN de la factura origen (snapshot al crear la NC).';
COMMENT ON COLUMN invoices.source_invoice_full_number IS
  'Número DIAN completo de la factura origen (snapshot al crear la NC).';
