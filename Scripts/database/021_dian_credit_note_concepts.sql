-- Catálogo DIAN: conceptos de nota crédito (ConceptoNotaCredito-2.1.gc)
CREATE TABLE IF NOT EXISTS dian_credit_note_concepts (
  code                    VARCHAR(2) PRIMARY KEY,
  name                    TEXT NOT NULL,
  description             TEXT,
  scope                   VARCHAR(10) NOT NULL CHECK (scope IN ('parcial', 'total', 'ambos')),
  dian_customization_id   VARCHAR(2) NOT NULL DEFAULT '20',
  dian_document_type_code VARCHAR(2) NOT NULL DEFAULT '91',
  dian_operation_type     VARCHAR(2) NOT NULL DEFAULT '20',
  sort_order              INT NOT NULL DEFAULT 0,
  is_active               BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO dian_credit_note_concepts (code, name, description, scope, sort_order) VALUES
  ('1', 'Devolución parcial de bienes y/o no aceptación parcial del servicio',
   'Acreditación parcial por devolución o rechazo parcial.', 'parcial', 10),
  ('2', 'Anulación de factura electrónica',
   'Anulación total de la factura de venta referenciada.', 'total', 20),
  ('3', 'Rebaja o descuento parcial o total',
   'Descuento comercial parcial o total sobre la factura.', 'ambos', 30),
  ('4', 'Ajuste de precio',
   'Corrección parcial del valor facturado.', 'parcial', 40),
  ('5', 'Otros',
   'Otros conceptos de corrección ante la DIAN.', 'ambos', 50)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  sort_order = EXCLUDED.sort_order;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS credit_note_concept_code VARCHAR(2)
    REFERENCES dian_credit_note_concepts(code),
  ADD COLUMN IF NOT EXISTS credit_note_scope VARCHAR(10)
    CHECK (credit_note_scope IS NULL OR credit_note_scope IN ('parcial', 'total'));

CREATE INDEX IF NOT EXISTS idx_invoices_nc_concept
  ON invoices(credit_note_concept_code)
  WHERE document_kind = 'nota_credito';
