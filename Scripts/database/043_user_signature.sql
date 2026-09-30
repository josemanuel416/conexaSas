-- Firma gráfica del usuario que elabora documentos comerciales
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signature_path VARCHAR(500);
