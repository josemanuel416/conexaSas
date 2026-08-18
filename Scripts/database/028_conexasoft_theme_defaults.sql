-- Defaults corporativos ConexaSoft para nuevas compañías
ALTER TABLE companies
  ALTER COLUMN theme_primary SET DEFAULT '#1976D2',
  ALTER COLUMN theme_secondary SET DEFAULT '#0D47A1',
  ALTER COLUMN theme_accent SET DEFAULT '#00E5FF';
