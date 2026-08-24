-- ============================================================
-- Notas débito/crédito de Cuentas por pagar + envíos DIAN tipo 95
-- ============================================================

DO $$ BEGIN
  CREATE TYPE fcxp_nota_status AS ENUM (
    'borrador',
    'confirmada',
    'enviada_dian',
    'aprobada_dian',
    'rechazada_dian',
    'anulada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE fcxp_tipo_nota AS ENUM ('DB', 'CR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fcxpdbcr (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fcxp_id         UUID NOT NULL REFERENCES fcxp(id) ON DELETE CASCADE,
  item            SMALLINT NOT NULL,
  tipo_nota       fcxp_tipo_nota NOT NULL,
  vlr_nota        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  afecta_imp      BOOLEAN NOT NULL DEFAULT false,
  vlr_impuesto    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  afecta_iva      BOOLEAN NOT NULL DEFAULT false,
  vlr_iva         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_neto        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  mdetalle        BOOLEAN NOT NULL DEFAULT false,
  detalle         TEXT,
  fecha_nota      DATE NOT NULL DEFAULT CURRENT_DATE,
  status          fcxp_nota_status NOT NULL DEFAULT 'borrador',
  cns_doc_ajuste  VARCHAR(30),
  cns_resol       UUID REFERENCES dian_resolutions(id) ON DELETE SET NULL,
  cude            VARCHAR(100),
  est_dian        VARCHAR(120),
  issue_date      DATE,
  issue_time      TIME,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fcxp_id, item)
);

CREATE INDEX IF NOT EXISTS idx_fcxpdbcr_fcxp ON fcxpdbcr(fcxp_id);
CREATE INDEX IF NOT EXISTS idx_fcxpdbcr_company ON fcxpdbcr(company_id, fecha_nota DESC);

CREATE TABLE IF NOT EXISTS fcxpdbcrd (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fcxpdbcr_id     UUID NOT NULL REFERENCES fcxpdbcr(id) ON DELETE CASCADE,
  fcxpd_id        UUID NOT NULL REFERENCES fcxpd(id) ON DELETE CASCADE,
  vlr_afecta      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_iva         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE(fcxpdbcr_id, fcxpd_id)
);

CREATE INDEX IF NOT EXISTS idx_fcxpdbcrd_nota ON fcxpdbcrd(fcxpdbcr_id);

CREATE TABLE IF NOT EXISTS fcxpdbcri (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fcxpdbcr_id     UUID NOT NULL REFERENCES fcxpdbcr(id) ON DELETE CASCADE,
  fcxpi_id        UUID REFERENCES fcxpi(id) ON DELETE SET NULL,
  cns_fcxpdbcri   SMALLINT NOT NULL,
  id_impuesto     UUID REFERENCES accounting_taxes(id) ON DELETE SET NULL,
  id_clase        UUID REFERENCES accounting_tax_classes(id) ON DELETE SET NULL,
  vlr_calc        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  base            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_impuesto    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE(fcxpdbcr_id, cns_fcxpdbcri)
);

CREATE INDEX IF NOT EXISTS idx_fcxpdbcri_nota ON fcxpdbcri(fcxpdbcr_id);

CREATE TABLE IF NOT EXISTS fcxpdbcr_dian_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fcxpdbcr_id         UUID NOT NULL REFERENCES fcxpdbcr(id) ON DELETE CASCADE,
  attempt_number      SMALLINT NOT NULL DEFAULT 1,
  dian_environment    VARCHAR(20) NOT NULL DEFAULT 'habilitacion',
  zip_file_name       VARCHAR(255),
  request_xml         TEXT,
  signed_xml          TEXT,
  response_xml        TEXT,
  status              dian_submission_status NOT NULL DEFAULT 'pendiente',
  status_code         VARCHAR(10),
  status_message      TEXT,
  track_id            VARCHAR(100),
  uuid                VARCHAR(100),
  is_success          BOOLEAN NOT NULL DEFAULT false,
  sent_at             TIMESTAMPTZ,
  responded_at        TIMESTAMPTZ,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(fcxpdbcr_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_fcxpdbcr_dian_submissions_nota ON fcxpdbcr_dian_submissions(fcxpdbcr_id);
CREATE INDEX IF NOT EXISTS idx_fcxpdbcr_dian_submissions_company ON fcxpdbcr_dian_submissions(company_id, created_at DESC);

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'cuentas_pagar.notas', 'Notas CxP', 'Registrar notas débito/crédito de cuentas por pagar', id, 6
FROM modules WHERE code = 'cuentas_pagar' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code = 'cuentas_pagar.notas'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
