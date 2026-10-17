CREATE TABLE inventory_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  output_ingredient_id uuid NOT NULL,
  output_quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
  deduct_mode text NOT NULL DEFAULT 'auto_on_sale' CHECK (deduct_mode IN ('auto_on_sale', 'hybrid', 'manual_prep')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_recipes_id_tenant_unique UNIQUE (id, tenant_id),
  CONSTRAINT inventory_recipes_output_unique UNIQUE (tenant_id, output_ingredient_id),
  CONSTRAINT inventory_recipes_output_tenant_fk
    FOREIGN KEY (output_ingredient_id, tenant_id)
    REFERENCES ingredients(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE inventory_recipe_items (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  recipe_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  CONSTRAINT inventory_recipe_items_pk PRIMARY KEY (recipe_id, ingredient_id),
  CONSTRAINT inventory_recipe_items_recipe_tenant_fk
    FOREIGN KEY (recipe_id, tenant_id)
    REFERENCES inventory_recipes(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT inventory_recipe_items_ingredient_tenant_fk
    FOREIGN KEY (ingredient_id, tenant_id)
    REFERENCES ingredients(id, tenant_id)
);

CREATE INDEX inventory_recipes_tenant_idx ON inventory_recipes(tenant_id);
CREATE INDEX inventory_recipes_output_idx ON inventory_recipes(output_ingredient_id);
CREATE INDEX inventory_recipe_items_tenant_idx ON inventory_recipe_items(tenant_id);
CREATE INDEX inventory_recipe_items_ingredient_idx ON inventory_recipe_items(ingredient_id);

ALTER TABLE inventory_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_recipes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_recipes ON inventory_recipes
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE inventory_recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_recipe_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_inventory_recipe_items ON inventory_recipe_items
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON inventory_recipes, inventory_recipe_items
  TO coffeeos_app;
