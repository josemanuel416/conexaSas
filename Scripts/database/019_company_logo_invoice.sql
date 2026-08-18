-- Logo y plantilla de representación gráfica (factura PDF)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS invoice_template VARCHAR(50) NOT NULL DEFAULT 'standard';

-- CONNETC GROUP SAS — colores corporativos del logo
UPDATE companies
SET logo_path = 'assets/companies/70ad39d6-00f2-406e-b1d7-2720c2630100/logo.png',
    theme_primary = '#F57C00',
    theme_secondary = '#1A1A1A',
    theme_accent = '#FFB300',
    invoice_template = 'standard'
WHERE nit = '902031938'
   OR id = '70ad39d6-00f2-406e-b1d7-2720c2630100'::uuid;
