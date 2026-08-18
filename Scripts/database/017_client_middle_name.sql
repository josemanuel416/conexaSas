-- Segundo nombre para personas naturales (DIAN UBL Person/MiddleName)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100);
