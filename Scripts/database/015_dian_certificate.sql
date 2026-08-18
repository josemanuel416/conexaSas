-- Certificado digital DIAN por compañía (firma ServerFEpos)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS dian_cert_subject_cn VARCHAR(255),
  ADD COLUMN IF NOT EXISTS dian_cert_subject_nit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS dian_cert_valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dian_cert_valid_to TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dian_cert_fingerprint VARCHAR(64),
  ADD COLUMN IF NOT EXISTS dian_cert_storage_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS dian_cert_password_enc TEXT,
  ADD COLUMN IF NOT EXISTS dian_cert_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dian_cert_synced_fepos_at TIMESTAMPTZ;
