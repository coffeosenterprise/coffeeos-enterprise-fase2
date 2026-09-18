-- Repara el catálogo global de permisos y asignaciones históricas.
-- No elimina usuarios, roles, tenants ni datos operativos.

-- El catálogo no tiene tenant_id: todos los tenants usan las mismas claves.
-- RLS permanece activo, pero el rol runtime sólo puede leerlo. Esto corrige
-- bases donde RLS se habilitó en `permissions` sin una política SELECT y
-- Prisma recibía `permission = null` durante el login.
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_read_catalog ON permissions;
CREATE POLICY permissions_read_catalog ON permissions
  FOR SELECT
  TO coffeeos_app
  USING (true);

GRANT SELECT ON permissions TO coffeeos_app;
REVOKE INSERT, UPDATE, DELETE ON permissions FROM coffeeos_app;

INSERT INTO permissions (key, description) VALUES
  ('tenant.manage', 'Administrar configuracion del Tenant, plan y feature flags'),
  ('organization.manage', 'Crear y administrar empresas, sucursales y terminales'),
  ('users.manage', 'Invitar, activar, bloquear y administrar usuarios'),
  ('roles.manage', 'Administrar roles y asignacion de permisos'),
  ('audit.read', 'Consultar el historial de auditoria'),
  ('catalog.manage', 'Crear y administrar categorias, productos, recetas y modificadores'),
  ('inventory.manage', 'Administrar ingredientes, existencias, entradas y alertas'),
  ('sales.create', 'Operar el punto de venta y registrar cobros'),
  ('cash.manage', 'Abrir y cerrar caja, consultar cortes y diferencias')
ON CONFLICT (key) DO NOTHING;

-- Proteccion para bases antiguas que pudieran conservar una asignacion
-- cuyo permission_id ya no existe. La migracion corre con el usuario
-- administrativo y solo elimina esas filas invalidas.
DELETE FROM role_permissions rp
WHERE NOT EXISTS (
  SELECT 1
  FROM permissions p
  WHERE p.id = rp.permission_id
);

-- OWNER debe conservar todos los permisos del catalogo global.
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT r.tenant_id, r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'OWNER'
ON CONFLICT DO NOTHING;
