-- Cotizaciones, prefacturas, notas crédito y seguimiento ampliado

DO $$ BEGIN
  CREATE TYPE sales_document_kind AS ENUM ('cotizacion', 'prefactura', 'factura', 'nota_credito');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'convertida';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS document_kind sales_document_kind NOT NULL DEFAULT 'factura',
  ADD COLUMN IF NOT EXISTS source_invoice_id UUID REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS internal_number VARCHAR(30);

ALTER TABLE invoices ALTER COLUMN dian_resolution_id DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN prefix DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN consecutive_number DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN full_number DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_internal_number
  ON invoices(company_id, document_kind, internal_number)
  WHERE internal_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_document_kind ON invoices(company_id, document_kind);
CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(source_invoice_id);

-- Permisos adicionales
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.cotizar', 'Cotizaciones y prefacturas', 'Crear cotizaciones y prefacturas de venta', id, 18
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.anular', 'Anular documentos', 'Anular facturas enviadas a la DIAN', id, 19
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'facturacion.notas_credito', 'Notas crédito', 'Emitir notas crédito electrónicas', id, 20
FROM modules WHERE code = 'facturacion' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'facturacion.seguimiento_dian', 'Seguimiento DIAN', 'Consultar envíos y errores DIAN', id, 21
FROM modules WHERE code = 'facturacion' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code IN ('ventas.cotizar', 'ventas.anular', 'facturacion.notas_credito', 'facturacion.seguimiento_dian')
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
