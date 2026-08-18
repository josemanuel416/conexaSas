-- Compañía operativa ConexaSoft S.A.S (factura servicios del ERP como cualquier tenant)
-- El panel /admin queda solo para control de plataforma; operación comercial vía login de compañía.

INSERT INTO companies (
  name,
  nit,
  slug,
  email,
  phone,
  address,
  theme_primary,
  theme_secondary,
  theme_accent,
  invoice_template,
  is_active
)
SELECT
  'ConexaSoft S.A.S',
  '900000001',
  'conexasoft',
  'contacto@conexasoft.com',
  NULL,
  NULL,
  '#1976D2',
  '#0D47A1',
  '#00E5FF',
  'standard',
  true
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE slug = 'conexasoft');

INSERT INTO company_modules (company_id, module_id, is_enabled)
SELECT c.id, m.id, true
FROM companies c
CROSS JOIN modules m
WHERE c.slug = 'conexasoft'
  AND m.code IN ('ventas', 'facturacion', 'agenda_citas', 'caja', 'inventario')
ON CONFLICT (company_id, module_id) DO UPDATE SET is_enabled = true;
