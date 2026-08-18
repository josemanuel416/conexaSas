-- Campos DIAN adicionales: resolución y configuración por compañía

ALTER TABLE dian_resolutions
  ADD COLUMN IF NOT EXISTS resolution_date DATE;

UPDATE dian_resolutions
SET resolution_date = valid_from
WHERE resolution_date IS NULL;

ALTER TABLE dian_resolutions
  ALTER COLUMN resolution_date SET DEFAULT CURRENT_DATE;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS verification_digit VARCHAR(1),
  ADD COLUMN IF NOT EXISTS dian_software_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS dian_test_set_id VARCHAR(100);
