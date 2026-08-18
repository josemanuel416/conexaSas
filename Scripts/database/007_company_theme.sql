-- Paleta de colores por compañía (tema en panel de empresa)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS theme_primary VARCHAR(7) NOT NULL DEFAULT '#00796B',
  ADD COLUMN IF NOT EXISTS theme_secondary VARCHAR(7) NOT NULL DEFAULT '#004D40',
  ADD COLUMN IF NOT EXISTS theme_accent VARCHAR(7) NOT NULL DEFAULT '#26A69A';
