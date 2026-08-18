-- Configuración de tipos de movimiento y vínculo venta → factura
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_client
  ON inventory_movements(client_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_invoice
  ON inventory_movements(invoice_id);

INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'inventory.movement.transfer_out_code',
  '09',
  'Traslado — salida',
  'Código del tipo de movimiento para salida por traslado a otra bodega.',
  30
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;

INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'inventory.movement.transfer_in_code',
  '10',
  'Traslado — entrada',
  'Código del tipo de movimiento para recepción de traslado en bodega destino.',
  31
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;

INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'inventory.movement.sale_out_code',
  '02',
  'Salida por venta',
  'Código del tipo de movimiento de salida por venta a clientes (permite generar factura).',
  32
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;
