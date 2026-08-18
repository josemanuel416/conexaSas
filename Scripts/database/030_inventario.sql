-- ============================================================
-- Módulo Inventario — catálogos, bodegas, artículos, lotes,
-- existencias y movimientos (multi-compañía)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE inventory_movement_direction AS ENUM ('entrada', 'salida');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE inventory_movement_status AS ENUM ('borrador', 'confirmado', 'anulado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- Tipos de artículo (catálogo por compañía)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_article_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         VARCHAR(20) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_inventory_article_types_company
  ON inventory_article_types(company_id);

-- ------------------------------------------------------------
-- Tipos de movimiento (catálogo por compañía, seed 01–10)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movement_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code         VARCHAR(5) NOT NULL,
  name         VARCHAR(120) NOT NULL,
  direction    inventory_movement_direction NOT NULL,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movement_types_company
  ON inventory_movement_types(company_id, sort_order);

-- ------------------------------------------------------------
-- Bodegas (consecutivos por bodega vía prefijo documental)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_warehouses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code             VARCHAR(20) NOT NULL,
  name             VARCHAR(120) NOT NULL,
  document_prefix  VARCHAR(10) NOT NULL,
  address          TEXT,
  is_default       BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code),
  UNIQUE(company_id, document_prefix)
);

CREATE INDEX IF NOT EXISTS idx_inventory_warehouses_company
  ON inventory_warehouses(company_id);

-- Consecutivo por bodega + tipo de movimiento
CREATE TABLE IF NOT EXISTS inventory_warehouse_sequences (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id       UUID NOT NULL REFERENCES inventory_warehouses(id) ON DELETE CASCADE,
  movement_type_id   UUID NOT NULL REFERENCES inventory_movement_types(id) ON DELETE CASCADE,
  last_consecutive   BIGINT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, movement_type_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_wh_seq_company
  ON inventory_warehouse_sequences(company_id);

-- Consecutivo global de lote interno por compañía
CREATE TABLE IF NOT EXISTS inventory_internal_lot_sequences (
  company_id         UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last_consecutive   BIGINT NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Artículos (control y consumo interno, separado de services)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_articles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  article_type_id        UUID REFERENCES inventory_article_types(id) ON DELETE SET NULL,
  code                   VARCHAR(50) NOT NULL,
  name                   VARCHAR(255) NOT NULL,
  description            TEXT,
  unit_of_measure        VARCHAR(20) NOT NULL DEFAULT 'UND',
  without_supplier_lot   BOOLEAN NOT NULL DEFAULT false,
  requires_expiry_date   BOOLEAN NOT NULL DEFAULT false,
  default_expiry_days    INTEGER NOT NULL DEFAULT 730,
  average_cost           NUMERIC(14, 4) NOT NULL DEFAULT 0,
  min_stock              NUMERIC(14, 4),
  max_stock              NUMERIC(14, 4),
  barcode                VARCHAR(50),
  is_active              BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, code),
  CHECK (default_expiry_days > 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_articles_company
  ON inventory_articles(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_articles_type
  ON inventory_articles(article_type_id);

COMMENT ON COLUMN inventory_articles.without_supplier_lot IS
  'Sin lote proveedor: al ingresar se usa el mismo número del lote interno automático';
COMMENT ON COLUMN inventory_articles.requires_expiry_date IS
  'Si false, al ingresar se asigna vencimiento = hoy + default_expiry_days (730 = 2 años)';
COMMENT ON COLUMN inventory_articles.average_cost IS
  'Costo promedio ponderado del artículo (valorización contable opcional)';

-- ------------------------------------------------------------
-- Lotes (interno automático + lote proveedor)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_lots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  article_id           UUID NOT NULL REFERENCES inventory_articles(id) ON DELETE CASCADE,
  internal_lot_number  VARCHAR(50) NOT NULL,
  supplier_lot_number  VARCHAR(50),
  manufacturing_date   DATE,
  expiry_date          DATE NOT NULL,
  notes                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, article_id, internal_lot_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_article
  ON inventory_lots(article_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry
  ON inventory_lots(company_id, expiry_date);

-- ------------------------------------------------------------
-- Existencias por bodega, artículo y lote
-- purchase_unit_cost = precio de compra en la existencia (salidas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_lot_balances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id        UUID NOT NULL REFERENCES inventory_warehouses(id) ON DELETE CASCADE,
  article_id          UUID NOT NULL REFERENCES inventory_articles(id) ON DELETE CASCADE,
  lot_id              UUID NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
  quantity_on_hand    NUMERIC(14, 4) NOT NULL DEFAULT 0,
  purchase_unit_cost  NUMERIC(14, 4) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, article_id, lot_id),
  CHECK (quantity_on_hand >= 0),
  CHECK (purchase_unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_wh
  ON inventory_lot_balances(warehouse_id, article_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_lot
  ON inventory_lot_balances(lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_company
  ON inventory_lot_balances(company_id);

COMMENT ON COLUMN inventory_lot_balances.purchase_unit_cost IS
  'Precio unitario de compra en esta existencia; usado en salidas y valorización por existencia';

-- ------------------------------------------------------------
-- Movimientos de inventario (encabezado)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id          UUID NOT NULL REFERENCES inventory_warehouses(id),
  target_warehouse_id   UUID REFERENCES inventory_warehouses(id),
  movement_type_id      UUID NOT NULL REFERENCES inventory_movement_types(id),
  related_movement_id   UUID REFERENCES inventory_movements(id),
  document_number       VARCHAR(40) NOT NULL,
  movement_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  status                inventory_movement_status NOT NULL DEFAULT 'borrador',
  third_party_name      VARCHAR(255),
  third_party_document  VARCHAR(30),
  reference_number      VARCHAR(60),
  notes                 TEXT,
  total_quantity        NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_value           NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by            UUID REFERENCES users(id),
  confirmed_by          UUID REFERENCES users(id),
  confirmed_at          TIMESTAMPTZ,
  voided_by             UUID REFERENCES users(id),
  voided_at             TIMESTAMPTZ,
  void_reason           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, warehouse_id, document_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_date
  ON inventory_movements(company_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_wh
  ON inventory_movements(warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_related
  ON inventory_movements(related_movement_id);

COMMENT ON COLUMN inventory_movements.target_warehouse_id IS
  'Bodega destino en traslados (tipos 09 salida / 10 recepción)';
COMMENT ON COLUMN inventory_movements.related_movement_id IS
  'Vincula salida por traslado (09) con recepción (10)';

-- ------------------------------------------------------------
-- Detalle de movimiento
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movement_details (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id       UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  line_number       SMALLINT NOT NULL,
  article_id        UUID NOT NULL REFERENCES inventory_articles(id),
  lot_id            UUID NOT NULL REFERENCES inventory_lots(id),
  warehouse_id      UUID NOT NULL REFERENCES inventory_warehouses(id),
  quantity          NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),
  unit_cost         NUMERIC(14, 4) NOT NULL DEFAULT 0,
  total_cost        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes             TEXT,
  UNIQUE(movement_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movement_details_movement
  ON inventory_movement_details(movement_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movement_details_article
  ON inventory_movement_details(article_id, lot_id);

COMMENT ON COLUMN inventory_movement_details.unit_cost IS
  'Entradas: precio de compra. Salidas: purchase_unit_cost de la existencia';

-- ------------------------------------------------------------
-- Seed tipos de movimiento por compañía (01–10)
-- ------------------------------------------------------------
INSERT INTO inventory_movement_types (company_id, code, name, direction, is_system, sort_order)
SELECT c.id, v.code, v.name, v.direction::inventory_movement_direction, true, v.sort_order
FROM companies c
CROSS JOIN (VALUES
  ('01', 'Entradas por compras',           'entrada',  1),
  ('02', 'Salida por venta',               'salida',   2),
  ('03', 'Entrada por remisión',           'entrada',  3),
  ('04', 'Entrada por préstamos',          'entrada',  4),
  ('05', 'Salida consumo interno',         'salida',   5),
  ('06', 'Salida por vencimiento',         'salida',   6),
  ('07', 'Salida por avería',              'salida',   7),
  ('08', 'Devolución a proveedor',         'salida',   8),
  ('09', 'Salida por traslado a otra bodega','salida',  9),
  ('10', 'Recepción de traslado',          'entrada', 10)
) AS v(code, name, direction, sort_order)
ON CONFLICT (company_id, code) DO NOTHING;

-- Secuencia de lote interno por compañía
INSERT INTO inventory_internal_lot_sequences (company_id, last_consecutive)
SELECT id, 0 FROM companies c
ON CONFLICT (company_id) DO NOTHING;

-- Variables de inventario
INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'inventory.internal_lot_prefix',
  'LT',
  'Prefijo lote interno',
  'Genera lotes internos automáticos: prefijo + consecutivo (ej. LT000001).',
  20
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;

INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'inventory.valuation_method',
  'average',
  'Método de valorización',
  'Valor del inventario: average = costo promedio del artículo; purchase = precio de compra en existencia.',
  21
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;

INSERT INTO company_system_variables (company_id, var_key, var_value, label, description, sort_order)
SELECT
  c.id,
  'inventory.articles.code_prefix',
  'ART',
  'Prefijo código de artículos',
  'Prefijo para códigos automáticos de artículos (ej. ART0001).',
  22
FROM companies c
ON CONFLICT (company_id, var_key) DO NOTHING;

-- Permisos adicionales inventario
INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.bodegas', 'Bodegas', 'Gestionar bodegas y prefijos de consecutivo', id, 23
FROM modules WHERE code = 'inventario' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.articulos', 'Artículos', 'Catálogo de artículos y tipos', id, 24
FROM modules WHERE code = 'inventario' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.movimientos', 'Movimientos', 'Crear y editar movimientos de inventario', id, 25
FROM modules WHERE code = 'inventario' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.confirmar', 'Confirmar movimientos', 'Confirmar movimientos y actualizar existencias', id, 26
FROM modules WHERE code = 'inventario' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.anular', 'Anular movimientos', 'Anular movimientos confirmados', id, 27
FROM modules WHERE code = 'inventario' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.catalogos', 'Catálogos inventario', 'Tipos de artículo y tipos de movimiento', id, 28
FROM modules WHERE code = 'inventario' ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, name, description, module_id, sort_order)
SELECT 'inventario.variables', 'Variables inventario', 'Configurar variables del módulo inventario', id, 29
FROM modules WHERE code = 'inventario' ON CONFLICT (code) DO NOTHING;

INSERT INTO user_permissions (user_id, permission_id, company_id)
SELECT u.id, p.id, u.company_id
FROM users u
JOIN permissions p ON p.code LIKE 'inventario.%'
WHERE u.role = 'company_admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;
