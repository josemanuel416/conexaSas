-- Ambiente DIAN "pruebas": facturación en vpfe-hab sin set de habilitación (SendBillSync)
ALTER TABLE dian_resolutions
  DROP CONSTRAINT IF EXISTS dian_resolutions_dian_environment_check;

ALTER TABLE dian_resolutions
  ADD CONSTRAINT dian_resolutions_dian_environment_check
  CHECK (dian_environment IN ('habilitacion', 'pruebas', 'produccion'));
