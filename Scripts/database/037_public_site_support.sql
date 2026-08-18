-- Sitio público, paquetes comerciales y soporte entre compañías y administrador

CREATE TABLE IF NOT EXISTS site_content (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_title TEXT NOT NULL DEFAULT 'ConexaSoft ERP',
  hero_subtitle TEXT,
  mission TEXT,
  vision TEXT,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  contact_email TEXT,
  contact_phone TEXT,
  contact_whatsapp TEXT,
  contact_address TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_content (
  id, hero_title, hero_subtitle, mission, vision, benefits,
  contact_email, contact_phone, contact_whatsapp, contact_address
) VALUES (
  1,
  'ConexaSoft ERP',
  'Gestión inteligente para empresas reales.',
  'Facilitar la operación diaria de las PYMES colombianas con un ERP modular, confiable y fácil de usar, integrando ventas, inventario, facturación electrónica y contabilidad.',
  'Ser la plataforma de gestión empresarial preferida en Colombia por su simplicidad, soporte cercano y cumplimiento normativo.',
  '[
    {"icon":"receipt_long","title":"Facturación electrónica DIAN","description":"Emisión y seguimiento de facturas electrónicas integradas al flujo comercial."},
    {"icon":"inventory_2","title":"Inventario en tiempo real","description":"Control de bodegas, movimientos y existencias por artículo."},
    {"icon":"point_of_sale","title":"Caja y ventas","description":"Prefacturas, cotizaciones, caja y clientes en un solo lugar."},
    {"icon":"account_balance","title":"Contabilidad","description":"Plan de cuentas, movimientos diarios, cierre de mes y reportes."},
    {"icon":"support_agent","title":"Soporte dedicado","description":"Canal directo para soporte, requerimientos y reporte de errores."},
    {"icon":"cloud","title":"Multi-compañía seguro","description":"Cada empresa con datos aislados, permisos granulares y panel administrativo."}
  ]'::jsonb,
  'contacto@conexasoft.com',
  '+57 300 000 0000',
  '+573000000000',
  'Colombia'
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  description TEXT,
  price_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(12, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'COP',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  module_codes TEXT[] NOT NULL DEFAULT '{}',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, features, module_codes, is_featured, sort_order)
VALUES
  (
    'Esencial',
    'esencial',
    'Ideal para empezar con ventas y facturación.',
    99000,
    990000,
    '["Hasta 3 usuarios","Ventas y cotizaciones","Facturación electrónica","Soporte por ticket"]'::jsonb,
    ARRAY['ventas', 'facturacion'],
    false,
    1
  ),
  (
    'Profesional',
    'profesional',
    'Operación completa con inventario y caja.',
    199000,
    1990000,
    '["Hasta 10 usuarios","Ventas + inventario + caja","Agenda de citas","Soporte prioritario"]'::jsonb,
    ARRAY['ventas', 'facturacion', 'inventario', 'caja', 'agenda_citas'],
    true,
    2
  ),
  (
    'Empresarial',
    'empresarial',
    'Suite completa incluyendo contabilidad.',
    349000,
    3490000,
    '["Usuarios ilimitados","Todos los módulos","Contabilidad","Implementación asistida"]'::jsonb,
    ARRAY['ventas', 'facturacion', 'inventario', 'caja', 'agenda_citas', 'contabilidad'],
    false,
    3
  )
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public_contact_messages (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(50),
  company_name VARCHAR(200),
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'nuevo'
    CHECK (status IN ('nuevo', 'leido', 'respondido')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_type VARCHAR(20) NOT NULL
    CHECK (ticket_type IN ('soporte', 'requerimiento', 'error')),
  subject VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'abierto'
    CHECK (status IN ('abierto', 'en_proceso', 'resuelto', 'cerrado')),
  priority VARCHAR(10) NOT NULL DEFAULT 'media'
    CHECK (priority IN ('baja', 'media', 'alta')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_staff_reply BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id);
