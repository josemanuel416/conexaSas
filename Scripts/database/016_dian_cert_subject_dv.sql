-- DV del titular en certificado DIAN (separado del NIT base)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS dian_cert_subject_dv VARCHAR(1);
