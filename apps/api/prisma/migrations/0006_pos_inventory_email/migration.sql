-- CoffeeOS Enterprise -- Migracion 0006
-- Verificacion de correo, Catalogo, Inventario, Ventas/POS y Caja.

CREATE UNIQUE INDEX IF NOT EXISTS terminals_id_tenant_id_key
  ON terminals (id, tenant_id);

CREATE TABLE email_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  CONSTRAINT email_verifications_user_tenant_fk
    FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id)
);
CREATE INDEX email_verifications_tenant_id_idx ON email_verifications(tenant_id);
CREATE INDEX email_verifications_user_id_idx ON email_verifications(user_id);

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#C87B45',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (id, tenant_id)
);
CREATE INDEX categories_tenant_id_idx ON categories(tenant_id);

CREATE TABLE ingredients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (id, tenant_id)
);
CREATE INDEX ingredients_tenant_id_idx ON ingredients(tenant_id);

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  category_id UUID NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  UNIQUE (id, tenant_id),
  CONSTRAINT products_category_tenant_fk
    FOREIGN KEY (category_id, tenant_id) REFERENCES categories(id, tenant_id)
);
CREATE INDEX products_tenant_id_idx ON products(tenant_id);
CREATE INDEX products_category_id_idx ON products(category_id);

CREATE TABLE modifier_groups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  product_id     UUID NOT NULL,
  name           TEXT NOT NULL,
  required       BOOLEAN NOT NULL DEFAULT false,
  min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections >= min_selections),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id, tenant_id),
  UNIQUE (product_id, name),
  CONSTRAINT modifier_groups_product_tenant_fk
    FOREIGN KEY (product_id, tenant_id) REFERENCES products(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX modifier_groups_tenant_id_idx ON modifier_groups(tenant_id);

CREATE TABLE modifier_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  group_id    UUID NOT NULL,
  name        TEXT NOT NULL,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (id, tenant_id),
  UNIQUE (group_id, name),
  CONSTRAINT modifier_options_group_tenant_fk
    FOREIGN KEY (group_id, tenant_id) REFERENCES modifier_groups(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX modifier_options_tenant_id_idx ON modifier_options(tenant_id);

CREATE TABLE product_ingredients (
  tenant_id    UUID NOT NULL,
  product_id   UUID NOT NULL,
  ingredient_id UUID NOT NULL,
  quantity     NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (product_id, ingredient_id),
  CONSTRAINT product_ingredients_product_tenant_fk
    FOREIGN KEY (product_id, tenant_id) REFERENCES products(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT product_ingredients_ingredient_tenant_fk
    FOREIGN KEY (ingredient_id, tenant_id) REFERENCES ingredients(id, tenant_id)
);
CREATE INDEX product_ingredients_tenant_id_idx ON product_ingredients(tenant_id);

CREATE TABLE modifier_option_ingredients (
  tenant_id         UUID NOT NULL,
  modifier_option_id UUID NOT NULL,
  ingredient_id     UUID NOT NULL,
  quantity          NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (modifier_option_id, ingredient_id),
  CONSTRAINT modifier_option_ingredients_option_tenant_fk
    FOREIGN KEY (modifier_option_id, tenant_id) REFERENCES modifier_options(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT modifier_option_ingredients_ingredient_tenant_fk
    FOREIGN KEY (ingredient_id, tenant_id) REFERENCES ingredients(id, tenant_id)
);
CREATE INDEX modifier_option_ingredients_tenant_id_idx
  ON modifier_option_ingredients(tenant_id);

CREATE TABLE inventory_stocks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  branch_id     UUID NOT NULL,
  ingredient_id UUID NOT NULL,
  quantity      NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity  NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, ingredient_id),
  UNIQUE (id, tenant_id),
  CONSTRAINT inventory_stocks_branch_tenant_fk
    FOREIGN KEY (branch_id, tenant_id) REFERENCES branches(id, tenant_id),
  CONSTRAINT inventory_stocks_ingredient_tenant_fk
    FOREIGN KEY (ingredient_id, tenant_id) REFERENCES ingredients(id, tenant_id)
);
CREATE INDEX inventory_stocks_tenant_id_idx ON inventory_stocks(tenant_id);
CREATE INDEX inventory_stocks_branch_id_idx ON inventory_stocks(branch_id);

CREATE TABLE inventory_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  stock_id      UUID NOT NULL,
  type          TEXT NOT NULL,
  quantity      NUMERIC(14,3) NOT NULL,
  balance_after NUMERIC(14,3) NOT NULL,
  reference_id  UUID,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_stock_tenant_fk
    FOREIGN KEY (stock_id, tenant_id) REFERENCES inventory_stocks(id, tenant_id)
);
CREATE INDEX inventory_movements_tenant_id_idx ON inventory_movements(tenant_id);
CREATE INDEX inventory_movements_stock_id_idx ON inventory_movements(stock_id);

CREATE TABLE cash_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  branch_id      UUID NOT NULL,
  terminal_id    UUID NOT NULL,
  opened_by_id   UUID NOT NULL,
  closed_by_id   UUID,
  opening_amount NUMERIC(12,2) NOT NULL CHECK (opening_amount >= 0),
  expected_cash  NUMERIC(12,2),
  counted_cash   NUMERIC(12,2),
  difference     NUMERIC(12,2),
  sales_total    NUMERIC(12,2),
  sale_count     INTEGER,
  status         TEXT NOT NULL DEFAULT 'open',
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at      TIMESTAMPTZ,
  UNIQUE (id, tenant_id),
  CONSTRAINT cash_sessions_branch_tenant_fk
    FOREIGN KEY (branch_id, tenant_id) REFERENCES branches(id, tenant_id),
  CONSTRAINT cash_sessions_terminal_tenant_fk
    FOREIGN KEY (terminal_id, tenant_id) REFERENCES terminals(id, tenant_id)
);
CREATE INDEX cash_sessions_tenant_id_idx ON cash_sessions(tenant_id);
CREATE INDEX cash_sessions_terminal_id_idx ON cash_sessions(terminal_id);
CREATE UNIQUE INDEX cash_sessions_one_open_per_terminal
  ON cash_sessions(terminal_id) WHERE status = 'open';

CREATE TABLE sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  branch_id       UUID NOT NULL,
  terminal_id     UUID NOT NULL,
  cash_session_id UUID NOT NULL,
  cashier_id      UUID NOT NULL,
  folio           SERIAL NOT NULL,
  subtotal        NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  total           NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  cash_received   NUMERIC(12,2) NOT NULL CHECK (cash_received >= 0),
  change_amount   NUMERIC(12,2) NOT NULL CHECK (change_amount >= 0),
  payment_method  TEXT NOT NULL DEFAULT 'cash',
  status          TEXT NOT NULL DEFAULT 'completed',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, folio),
  UNIQUE (id, tenant_id),
  CONSTRAINT sales_branch_tenant_fk
    FOREIGN KEY (branch_id, tenant_id) REFERENCES branches(id, tenant_id),
  CONSTRAINT sales_terminal_tenant_fk
    FOREIGN KEY (terminal_id, tenant_id) REFERENCES terminals(id, tenant_id),
  CONSTRAINT sales_cash_session_tenant_fk
    FOREIGN KEY (cash_session_id, tenant_id) REFERENCES cash_sessions(id, tenant_id)
);
CREATE INDEX sales_tenant_id_idx ON sales(tenant_id);
CREATE INDEX sales_cash_session_id_idx ON sales(cash_session_id);
CREATE INDEX sales_created_at_idx ON sales(created_at);

CREATE TABLE sale_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  sale_id      UUID NOT NULL,
  product_id   UUID NOT NULL,
  product_name TEXT NOT NULL,
  unit_price   NUMERIC(12,2) NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  subtotal     NUMERIC(12,2) NOT NULL,
  UNIQUE (id, tenant_id),
  CONSTRAINT sale_items_sale_tenant_fk
    FOREIGN KEY (sale_id, tenant_id) REFERENCES sales(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT sale_items_product_tenant_fk
    FOREIGN KEY (product_id, tenant_id) REFERENCES products(id, tenant_id)
);
CREATE INDEX sale_items_tenant_id_idx ON sale_items(tenant_id);
CREATE INDEX sale_items_sale_id_idx ON sale_items(sale_id);

CREATE TABLE sale_item_modifiers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  sale_item_id       UUID NOT NULL,
  modifier_option_id UUID NOT NULL,
  name               TEXT NOT NULL,
  price_delta        NUMERIC(12,2) NOT NULL,
  CONSTRAINT sale_item_modifiers_item_tenant_fk
    FOREIGN KEY (sale_item_id, tenant_id) REFERENCES sale_items(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT sale_item_modifiers_option_tenant_fk
    FOREIGN KEY (modifier_option_id, tenant_id) REFERENCES modifier_options(id, tenant_id)
);
CREATE INDEX sale_item_modifiers_tenant_id_idx ON sale_item_modifiers(tenant_id);
CREATE INDEX sale_item_modifiers_sale_item_id_idx ON sale_item_modifiers(sale_item_id);

-- Row-Level Security obligatorio para toda tabla operativa nueva.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'email_verifications', 'categories', 'products', 'modifier_groups',
    'modifier_options', 'ingredients', 'product_ingredients',
    'modifier_option_ingredients', 'inventory_stocks', 'inventory_movements',
    'cash_sessions', 'sales', 'sale_items', 'sale_item_modifiers'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''app.current_tenant'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.current_tenant'', true)::uuid)',
      'tenant_isolation_' || table_name,
      table_name
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  email_verifications, categories, products, modifier_groups,
  modifier_options, ingredients, product_ingredients,
  modifier_option_ingredients, inventory_stocks, inventory_movements,
  cash_sessions, sales, sale_items, sale_item_modifiers
TO coffeeos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO coffeeos_app;

INSERT INTO permissions (key, description) VALUES
  ('catalog.manage', 'Crear y administrar categorias, productos, recetas y modificadores'),
  ('inventory.manage', 'Administrar ingredientes, existencias, entradas y alertas'),
  ('sales.create', 'Operar el punto de venta y registrar cobros'),
  ('cash.manage', 'Abrir y cerrar caja, consultar cortes y diferencias')
ON CONFLICT (key) DO NOTHING;

-- Los propietarios, administradores y gerentes reciben las capacidades nuevas.
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('OWNER', 'ADMIN', 'MANAGER')
  AND p.key IN ('catalog.manage', 'inventory.manage', 'sales.create', 'cash.manage')
ON CONFLICT DO NOTHING;

-- Roles operativos con el minimo necesario.
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
JOIN permissions p ON
  (r.name = 'CASHIER' AND p.key IN ('sales.create', 'cash.manage'))
  OR (r.name = 'BARISTA' AND p.key = 'sales.create')
  OR (r.name = 'WAREHOUSE' AND p.key = 'inventory.manage')
ON CONFLICT DO NOTHING;
