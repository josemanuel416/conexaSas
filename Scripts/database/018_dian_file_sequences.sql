-- Consecutivos hex DIAN por compañía (ad, fv, ar, etc.)
CREATE TABLE IF NOT EXISTS dian_file_sequences (
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_kind    VARCHAR(8) NOT NULL,
  year        SMALLINT NOT NULL,
  last_value  INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, doc_kind, year)
);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS dian_assignment_code VARCHAR(3) NOT NULL DEFAULT '000';

ALTER TABLE dian_submissions
  ADD COLUMN IF NOT EXISTS attached_document_file_name VARCHAR(64);
