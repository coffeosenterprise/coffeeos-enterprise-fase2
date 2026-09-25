ALTER TABLE inventory_stocks
  ADD COLUMN IF NOT EXISTS average_unit_cost numeric(14,4) NOT NULL DEFAULT 0;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,4),
  ADD COLUMN IF NOT EXISTS total_cost numeric(14,4);

UPDATE inventory_movements
SET unit_cost = 0,
    total_cost = abs(quantity) * 0
WHERE unit_cost IS NULL OR total_cost IS NULL;
