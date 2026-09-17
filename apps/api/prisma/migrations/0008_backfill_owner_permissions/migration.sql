-- Repara Tenants existentes cuyo rol OWNER pudo quedar sin alguno de los
-- permisos globales añadidos antes o después de crear la cuenta.
--
-- Es idempotente: la clave primaria de role_permissions evita duplicados y
-- ON CONFLICT conserva cualquier asignación ya existente.
INSERT INTO role_permissions (tenant_id, role_id, permission_id)
SELECT roles.tenant_id, roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.name = 'OWNER'
ON CONFLICT DO NOTHING;
