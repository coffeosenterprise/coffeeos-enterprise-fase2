ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS balance_before numeric(14,3),
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS reason text;

UPDATE inventory_movements
SET balance_before = balance_after - quantity
WHERE balance_before IS NULL;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_actor_tenant_fk
  FOREIGN KEY (actor_id, tenant_id) REFERENCES users(id, tenant_id);

CREATE INDEX IF NOT EXISTS inventory_movements_actor_id_idx
  ON inventory_movements(actor_id);
CREATE INDEX IF NOT EXISTS inventory_movements_created_at_idx
  ON inventory_movements(created_at);
