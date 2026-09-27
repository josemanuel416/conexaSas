-- ============================================================
-- Módulo Cuentas por pagar + Documento Soporte DIAN
-- ============================================================

INSERT INTO modules (code, name, description, icon, sort_order) VALUES
  ('cuentas_pagar', 'Cuentas por pagar', 'Facturas de proveedor y documento soporte DIAN', 'payments', 9)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS maneja_doc_soporte BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE dian_resolutions
  ADD COLUMN IF NOT EXISTS document_process VARCHAR(2) NOT NULL DEFAULT 'FV';

ALTER TABLE dian_resolutions
  DROP CONSTRAINT IF EXISTS dian_resolutions_document_process_check;

ALTER TABLE dian_resolutions
  ADD CONSTRAINT dian_resolutions_document_process_check
  CHECK (document_process IN ('FV', 'DS'));

UPDATE dian_resolutions SET document_process = 'FV' WHERE document_process IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dian_resolutions_active_process_type
  ON dian_resolutions (company_id, document_process, document_type)
  WHERE is_active = true;

DO $$ BEGIN
  CREATE TYPE fcxp_status AS ENUM (
    'borrador',
    'confirmada',
    'enviada_dian',
    'aprobada_dian',
    'rechazada_dian',
    'anulada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fcxp (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cns_fcxp          BIGINT NOT NULL,
  cns_interno       VARCHAR(30),
  fecha_cxp         DATE NOT NULL DEFAULT CURRENT_DATE,
  nro_factura       VARCHAR(60),
  fecha_factura     DATE,
  fecha_vence       DATE,
  id_tercero        UUID NOT NULL REFERENCES clients(id),
  detalle           TEXT,
  maneja_doc_soporte BOOLEAN NOT NULL DEFAULT false,
  cns_doc_soporte   VARCHAR(30),
  cns_resol         UUID REFERENCES dian_resolutions(id),
  est_dian          VARCHAR(120),
  cude              VARCHAR(100),
  cuenta_conta      UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  contabilizada     BOOLEAN NOT NULL DEFAULT false,
  nro_comprobante   VARCHAR(60),
  vlr_bruto         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_iva           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_impuestos     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  valor_neto        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_nota_db       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_nota_cr       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_abonos        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  saldo             NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status            fcxp_status NOT NULL DEFAULT 'borrador',
  issue_date        DATE,
  issue_time        TIME,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, cns_fcxp)
);

CREATE INDEX IF NOT EXISTS idx_fcxp_company ON fcxp(company_id, fecha_cxp DESC);
CREATE INDEX IF NOT EXISTS idx_fcxp_tercero ON fcxp(id_tercero);
CREATE INDEX IF NOT EXISTS idx_fcxp_status ON fcxp(company_id, status);

CREATE TABLE IF NOT EXISTS fcxpd (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fcxp_id         UUID NOT NULL REFERENCES fcxp(id) ON DELETE CASCADE,
  item            SMALLINT NOT NULL,
  id_servicio     UUID REFERENCES services(id) ON DELETE SET NULL,
  descripcion     TEXT,
  valor           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cantidad        NUMERIC(14, 4) NOT NULL DEFAULT 1,
  vlr_iva         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_descuento   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_imp_consumo NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_neto        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cuenta_conta    UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  UNIQUE(fcxp_id, item)
);

CREATE INDEX IF NOT EXISTS idx_fcxpd_fcxp ON fcxpd(fcxp_id);

CREATE TABLE IF NOT EXISTS fcxpi (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fcxp_id         UUID NOT NULL REFERENCES fcxp(id) ON DELETE CASCADE,
  cns_fcxpi       SMALLINT NOT NULL,
  id_impuesto     UUID REFERENCES accounting_taxes(id) ON DELETE SET NULL,
  id_clase        UUID REFERENCES accounting_tax_classes(id) ON DELETE SET NULL,
  vlr_calc        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  base            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vlr_impuesto    NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cuenta_conta    UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL,
  UNIQUE(fcxp_id, cns_fcxpi)
);

CREATE INDEX IF NOT EXISTS idx_fcxpi_fcxp ON fcxpi(fcxp_id);

CREATE TABLE IF NOT EXISTS fcxp_dian_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fcxp_id             UUID NOT NULL REFERENCES fcxp(id) ON DELETE CASCADE,
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
  UNIQUE(fcxp_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_fcxp_dian_submissions_fcxp ON fcxp_dian_submissions(fcxp_id);
CREATE INDEX IF NOT EXISTS idx_fcxp_dian_submissions_company ON fcxp_dian_submissions(company_id, created_at DESC);

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'cuentas_pagar.acceso', 'Acceso cuentas por pagar', 'Ver cuentas por pagar', id, 1
FROM modules WHERE code = 'cuentas_pagar' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'cuentas_pagar.registrar', 'Registrar CxP', 'Crear y editar cuentas por pagar', id, 2
FROM modules WHERE code = 'cuentas_pagar' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'cuentas_pagar.confirmar', 'Confirmar CxP', 'Confirmar cuentas por pagar', id, 3
FROM modules WHERE code = 'cuentas_pagar' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'cuentas_pagar.enviar_dian', 'Enviar DS DIAN', 'Enviar documento soporte a DIAN', id, 4
FROM modules WHERE code = 'cuentas_pagar' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'cuentas_pagar.anular', 'Anular CxP', 'Anular cuentas por pagar', id, 5
FROM modules WHERE code = 'cuentas_pagar' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code LIKE 'cuentas_pagar.%'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
