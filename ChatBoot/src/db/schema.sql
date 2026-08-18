CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  state VARCHAR(50) NOT NULL DEFAULT 'idle',
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  whatsapp_message_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

CREATE TABLE IF NOT EXISTS invoice_requests (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  clave_seguridad VARCHAR(255) NOT NULL,
  tercero VARCHAR(255) NOT NULL,
  servicio VARCHAR(255) NOT NULL,
  cantidad NUMERIC(12, 2) NOT NULL,
  descuento_aplica BOOLEAN NOT NULL DEFAULT FALSE,
  descuento_valor NUMERIC(12, 2),
  descuento_tipo VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  response_message TEXT,
  factura_id VARCHAR(100),
  pdf_path VARCHAR(500),
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoice_requests_session_id ON invoice_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_created_at ON invoice_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_invoice_requests_status ON invoice_requests(status);
