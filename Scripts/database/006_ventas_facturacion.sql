-- ============================================================
-- Módulo Ventas / Facturación electrónica DIAN (multi-compañía)
-- Reutiliza clients y services del catálogo compartido (agenda)
-- ============================================================

-- Resolución DIAN por compañía (numeración autorizada)
CREATE TABLE IF NOT EXISTS dian_resolutions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resolution_number   VARCHAR(30) NOT NULL,
  prefix              VARCHAR(10) NOT NULL,
  range_from          BIGINT NOT NULL,
  range_to            BIGINT NOT NULL,
  current_consecutive BIGINT NOT NULL,
  valid_from          DATE NOT NULL,
  valid_to            DATE NOT NULL,
  technical_key       VARCHAR(100),
  document_type       VARCHAR(5) NOT NULL DEFAULT '01',
  dian_environment    VARCHAR(20) NOT NULL DEFAULT 'habilitacion'
    CHECK (dian_environment IN ('habilitacion', 'produccion')),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, resolution_number),
  UNIQUE(company_id, prefix),
  CHECK (range_to >= range_from),
  CHECK (current_consecutive >= range_from - 1)
);

CREATE INDEX IF NOT EXISTS idx_dian_resolutions_company ON dian_resolutions(company_id);

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM (
    'borrador',
    'emitida',
    'enviada_dian',
    'aprobada_dian',
    'rechazada_dian',
    'anulada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Factura (encabezado)
CREATE TABLE IF NOT EXISTS invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  dian_resolution_id  UUID NOT NULL REFERENCES dian_resolutions(id),
  client_id           UUID NOT NULL REFERENCES clients(id),
  internal_ticket_id  UUID REFERENCES internal_tickets(id),
  prefix              VARCHAR(10) NOT NULL,
  consecutive_number  BIGINT NOT NULL,
  full_number         VARCHAR(30) NOT NULL,
  issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  issue_time          TIME NOT NULL DEFAULT CURRENT_TIME,
  due_date            DATE,
  currency            VARCHAR(3) NOT NULL DEFAULT 'COP',
  subtotal            NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total               NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status              invoice_status NOT NULL DEFAULT 'borrador',
  cufe                VARCHAR(100),
  notes               TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, full_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_company_date ON invoices(company_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Detalle de factura
CREATE TABLE IF NOT EXISTS invoice_details (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number       SMALLINT NOT NULL,
  service_id        UUID REFERENCES services(id) ON DELETE SET NULL,
  item_code         VARCHAR(50) NOT NULL,
  description       VARCHAR(255) NOT NULL,
  quantity          NUMERIC(14, 4) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(5, 2) NOT NULL DEFAULT 19,
  tax_amount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_invoice_details_invoice ON invoice_details(invoice_id);

DO $$ BEGIN
  CREATE TYPE dian_submission_status AS ENUM (
    'pendiente',
    'enviado',
    'aprobado',
    'rechazado',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Envío y respuesta DIAN por factura
CREATE TABLE IF NOT EXISTS dian_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
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
  UNIQUE(invoice_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_dian_submissions_invoice ON dian_submissions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dian_submissions_company ON dian_submissions(company_id, created_at DESC);

-- Permisos del módulo ventas
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.clientes', 'Gestionar clientes (ventas)', 'Crear y editar clientes desde ventas', id, 12
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.servicios', 'Gestionar servicios (ventas)', 'Crear y editar servicios desde ventas', id, 13
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.resoluciones', 'Resoluciones DIAN', 'Configurar resoluciones de numeración DIAN', id, 14
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.facturar', 'Crear facturas', 'Registrar facturas de venta', id, 15
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.enviar_dian', 'Enviar a DIAN', 'Enviar facturas electrónicas a la DIAN', id, 16
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'ventas.ver_dian', 'Ver respuestas DIAN', 'Consultar envíos y respuestas DIAN', id, 17
FROM modules WHERE code = 'ventas' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code LIKE 'ventas.%'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
