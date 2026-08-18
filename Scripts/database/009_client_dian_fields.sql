-- Campos adquiriente para facturación electrónica DIAN

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS verification_digit VARCHAR(1),
  ADD COLUMN IF NOT EXISTS person_type VARCHAR(20) NOT NULL DEFAULT 'natural'
    CHECK (person_type IN ('natural', 'juridica')),
  ADD COLUMN IF NOT EXISTS tax_level_code VARCHAR(20) NOT NULL DEFAULT 'R-99-PN',
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS city_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS department_code VARCHAR(5),
  ADD COLUMN IF NOT EXISTS department_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(3) NOT NULL DEFAULT 'CO';

-- document_type: códigos DIAN (13 CC, 22 CE, 31 NIT, 41 Pasaporte, 42 Doc. extranjero)
COMMENT ON COLUMN clients.document_type IS 'Código DIAN: 13=CC, 22=CE, 31=NIT, 41=Pasaporte, 42=Doc.extranjero';
COMMENT ON COLUMN clients.person_type IS 'natural=2, juridica=1 en AdditionalAccountID UBL';
COMMENT ON COLUMN clients.tax_level_code IS 'Responsabilidad fiscal DIAN listName 48';

-- Normalizar tipos legacy
UPDATE clients SET document_type = '13' WHERE UPPER(document_type) = 'CC';
UPDATE clients SET document_type = '22' WHERE UPPER(document_type) = 'CE';
UPDATE clients SET document_type = '31' WHERE UPPER(document_type) = 'NIT';
