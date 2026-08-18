-- Nivel de cuenta en plan contable (derivado de longitud del código)
ALTER TABLE accounting_accounts
  ADD COLUMN IF NOT EXISTS level SMALLINT;

UPDATE accounting_accounts SET level = CASE
  WHEN length(code) = 1 THEN 1
  WHEN length(code) = 2 THEN 2
  ELSE (length(code) / 2) + 1
END
WHERE level IS NULL;

ALTER TABLE accounting_accounts
  ALTER COLUMN level SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_accounts_company_level
  ON accounting_accounts(company_id, level, code);
