-- Detalle de movimiento: lot_id nullable en borradores de entrada
ALTER TABLE inventory_movement_details
  ALTER COLUMN lot_id DROP NOT NULL;

ALTER TABLE inventory_movement_details
  ADD COLUMN IF NOT EXISTS supplier_lot_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS expiry_date DATE;
