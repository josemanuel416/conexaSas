-- PIN / clave del software registrado en DIAN (por compañía)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS dian_software_pin VARCHAR(255);
