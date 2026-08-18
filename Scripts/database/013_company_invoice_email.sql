-- Configuración SMTP para envío de facturas a clientes (por compañía)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS invoice_email_from VARCHAR(255),
  ADD COLUMN IF NOT EXISTS invoice_email_from_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS invoice_smtp_host VARCHAR(255),
  ADD COLUMN IF NOT EXISTS invoice_smtp_port SMALLINT DEFAULT 587,
  ADD COLUMN IF NOT EXISTS invoice_smtp_secure BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_smtp_user VARCHAR(255),
  ADD COLUMN IF NOT EXISTS invoice_smtp_password VARCHAR(255);
