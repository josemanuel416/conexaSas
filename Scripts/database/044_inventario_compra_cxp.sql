-- Compras a proveedores: datos de factura en la entrada y CxP generada al confirmar
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS supplier_invoice_number VARCHAR(60),
  ADD COLUMN IF NOT EXISTS supplier_invoice_date DATE,
  ADD COLUMN IF NOT EXISTS supplier_invoice_due_date DATE,
  ADD COLUMN IF NOT EXISTS fcxp_id UUID REFERENCES fcxp(id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_fcxp
  ON inventory_movements(fcxp_id);

INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'inventory.movement.purchase_in_code',
  '01',
  'Compras a proveedores',
  'Código del tipo de entrada por compra. Al confirmar se crea la cuenta por pagar al proveedor con N. factura, fecha de generación y vencimiento.',
  33
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;
