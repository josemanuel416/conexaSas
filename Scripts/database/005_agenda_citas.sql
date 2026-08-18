-- ============================================================
-- Módulo Agenda de Citas (multi-compañía)
-- ============================================================

-- Profesionales disponibles para agendar
CREATE TABLE IF NOT EXISTS professionals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type   VARCHAR(20) NOT NULL DEFAULT 'CC',
  document_number VARCHAR(30) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  phone           VARCHAR(30),
  email           VARCHAR(255),
  specialty       VARCHAR(150),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, document_number)
);

CREATE INDEX IF NOT EXISTS idx_professionals_company ON professionals(company_id);

-- Servicios a prestar
CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code        VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  base_price  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_services_company ON services(company_id);

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type   VARCHAR(20) NOT NULL DEFAULT 'CC',
  document_number VARCHAR(30) NOT NULL,
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  phone           VARCHAR(30),
  email           VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, document_number)
);

CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);

-- Modelo de agenda por profesional (ej: Modelo A)
CREATE TABLE IF NOT EXISTS schedule_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  professional_id      UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  name                 VARCHAR(100) NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_templates_prof ON schedule_templates(professional_id);

-- Programación: días y horarios del modelo (1=Lunes ... 7=Domingo)
CREATE TABLE IF NOT EXISTS schedule_programming (
  id                  SERIAL PRIMARY KEY,
  schedule_template_id UUID NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
  day_of_week         SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_schedule_prog_template ON schedule_programming(schedule_template_id);

-- Estados de cita
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'programada', 'cumplida', 'reagendada', 'cancelada', 'facturada'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agenda / Citas
CREATE TABLE IF NOT EXISTS appointments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  professional_id       UUID NOT NULL REFERENCES professionals(id),
  client_id             UUID NOT NULL REFERENCES clients(id),
  service_id            UUID NOT NULL REFERENCES services(id),
  appointment_date      DATE NOT NULL,
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  service_base_price    NUMERIC(14, 2) NOT NULL,
  final_price           NUMERIC(14, 2) NOT NULL,
  discount_amount       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount_percent      NUMERIC(5, 2) NOT NULL DEFAULT 0,
  discount_authorized_by UUID REFERENCES users(id),
  price_override        BOOLEAN NOT NULL DEFAULT false,
  price_override_reason TEXT,
  status                appointment_status NOT NULL DEFAULT 'programada',
  notes                 TEXT,
  rescheduled_from_id   UUID REFERENCES appointments(id),
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_company_date ON appointments(company_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments(professional_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Tickets internos (facturación del día)
CREATE TABLE IF NOT EXISTS internal_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  appointment_id  UUID NOT NULL REFERENCES appointments(id),
  ticket_number   VARCHAR(30) NOT NULL,
  ticket_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal        NUMERIC(14, 2) NOT NULL,
  discount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total           NUMERIC(14, 2) NOT NULL,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_tickets_company_date ON internal_tickets(company_id, ticket_date);

-- Permisos adicionales del módulo agenda
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.profesionales', 'Gestionar profesionales', 'Crear y editar profesionales', id, 72
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.servicios', 'Gestionar servicios', 'Crear y editar servicios', id, 73
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.clientes', 'Gestionar clientes', 'Crear y editar clientes', id, 74
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.modelos', 'Modelos de agenda', 'Configurar horarios por profesional', id, 75
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.agendar', 'Agendar citas', 'Crear citas en la agenda', id, 76
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.descuento', 'Aplicar descuentos', 'Autorizar descuentos en citas', id, 77
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.cambiar_valor', 'Cambiar valor', 'Modificar precio por encima del base', id, 78
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.cumplida', 'Marcar cumplida', 'Marcar cita como cumplida', id, 79
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.reagendar', 'Reagendar citas', 'Mover citas a otra fecha/hora', id, 80
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.facturar', 'Facturar citas', 'Generar ticket interno de facturación', id, 81
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'agenda_citas.ver_facturado', 'Ver facturado del día', 'Consultar tickets facturados', id, 82
FROM modules WHERE code = 'agenda_citas' ON CONFLICT (code) DO NOTHING;

-- Asignar nuevos permisos a admins de compañía existentes
INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code LIKE 'agenda_citas.%'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
