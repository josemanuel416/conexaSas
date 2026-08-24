-- En ambiente de pruebas DIAN emite una sola resolución (número + prefijo)
-- para FV y DS. Se permite repetir ese par por proceso; en habilitación y
-- producción el prefijo y el número siguen siendo únicos por compañía.

ALTER TABLE dian_resolutions
  DROP CONSTRAINT IF EXISTS dian_resolutions_company_id_resolution_number_key;

ALTER TABLE dian_resolutions
  DROP CONSTRAINT IF EXISTS dian_resolutions_company_id_prefix_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dian_resolutions_prefix_non_pruebas
  ON dian_resolutions (company_id, prefix)
  WHERE dian_environment <> 'pruebas';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dian_resolutions_number_non_pruebas
  ON dian_resolutions (company_id, resolution_number)
  WHERE dian_environment <> 'pruebas';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dian_resolutions_pair_process
  ON dian_resolutions (company_id, resolution_number, prefix, document_process);
