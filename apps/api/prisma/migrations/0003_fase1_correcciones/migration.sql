-- CoffeeOS Enterprise -- Migracion 0003: correcciones de revision de Fase 1
-- Ver "Fase 1 - Documento de Cierre v1.1" para el detalle de cada punto.

-- ============================================================
-- Punto 2: slug de Tenant para resolucion en Login (ADR-019)
-- ============================================================
ALTER TABLE tenants ADD COLUMN slug TEXT;
UPDATE tenants SET slug = id::text WHERE slug IS NULL; -- solo por si hubiera filas previas en un entorno de pruebas
ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;
ALTER TABLE tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

-- ============================================================
-- Punto 13: integridad Multi-Tenant de relaciones (FKs compuestas)
--
-- Antes: p.ej. user_roles.role_id -> roles(id) solamente. Un row de
-- user_roles con tenant_id = A podia, en teoria, apuntar a un role_id
-- perteneciente al tenant B (RLS solo valida el tenant_id de la
-- propia fila, no el de las filas referenciadas). Ahora cada FK
-- exige que el (id, tenant_id) del padre coincida exactamente.
-- ============================================================

-- Unicidad compuesta necesaria en cada tabla padre antes de poder
-- referenciarla con una FK compuesta.
ALTER TABLE companies ADD CONSTRAINT companies_id_tenant_id_key UNIQUE (id, tenant_id);
ALTER TABLE branches  ADD CONSTRAINT branches_id_tenant_id_key  UNIQUE (id, tenant_id);
ALTER TABLE users     ADD CONSTRAINT users_id_tenant_id_key     UNIQUE (id, tenant_id);
ALTER TABLE roles     ADD CONSTRAINT roles_id_tenant_id_key     UNIQUE (id, tenant_id);

-- branches.company_id -> companies(id, tenant_id)
ALTER TABLE branches DROP CONSTRAINT branches_company_id_fkey;
ALTER TABLE branches ADD CONSTRAINT branches_company_id_tenant_id_fkey
    FOREIGN KEY (company_id, tenant_id) REFERENCES companies (id, tenant_id);

-- terminals.branch_id -> branches(id, tenant_id)
ALTER TABLE terminals DROP CONSTRAINT terminals_branch_id_fkey;
ALTER TABLE terminals ADD CONSTRAINT terminals_branch_id_tenant_id_fkey
    FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);

-- role_permissions.role_id -> roles(id, tenant_id)
ALTER TABLE role_permissions DROP CONSTRAINT role_permissions_role_id_fkey;
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_tenant_id_fkey
    FOREIGN KEY (role_id, tenant_id) REFERENCES roles (id, tenant_id);
-- permission_id sigue apuntando a permissions(id): catalogo global sin tenant_id, correcto tal cual.

-- user_roles.user_id -> users(id, tenant_id); user_roles.role_id -> roles(id, tenant_id)
ALTER TABLE user_roles DROP CONSTRAINT user_roles_user_id_fkey;
ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_id_fkey;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_tenant_id_fkey
    FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id);
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_id_tenant_id_fkey
    FOREIGN KEY (role_id, tenant_id) REFERENCES roles (id, tenant_id);

-- user_branch_assignments.user_id -> users(id, tenant_id); .branch_id -> branches(id, tenant_id)
ALTER TABLE user_branch_assignments DROP CONSTRAINT user_branch_assignments_user_id_fkey;
ALTER TABLE user_branch_assignments DROP CONSTRAINT user_branch_assignments_branch_id_fkey;
ALTER TABLE user_branch_assignments ADD CONSTRAINT uba_user_id_tenant_id_fkey
    FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id);
ALTER TABLE user_branch_assignments ADD CONSTRAINT uba_branch_id_tenant_id_fkey
    FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);

-- sessions.user_id -> users(id, tenant_id)
ALTER TABLE sessions DROP CONSTRAINT sessions_user_id_fkey;
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_tenant_id_fkey
    FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id);

-- invitations.role_id -> roles(id, tenant_id)
ALTER TABLE invitations DROP CONSTRAINT invitations_role_id_fkey;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_id_tenant_id_fkey
    FOREIGN KEY (role_id, tenant_id) REFERENCES roles (id, tenant_id);

-- password_reset_tokens.user_id -> users(id, tenant_id)
ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_user_id_fkey;
ALTER TABLE password_reset_tokens ADD CONSTRAINT prt_user_id_tenant_id_fkey
    FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id);

-- Indices adicionales usados por los flujos de login/refresh/activacion.
CREATE INDEX idx_sessions_refresh_token_hash ON sessions (refresh_token_hash);
CREATE INDEX idx_invitations_token_hash ON invitations (token_hash);
CREATE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens (token_hash);

-- ============================================================
-- Punto 13: inmutabilidad de Audit a nivel de base de datos
--
-- Las politicas RLS ya creadas en la migracion 0001 no restringen
-- por tipo de operacion (aplican a SELECT/INSERT/UPDATE/DELETE por
-- igual), por lo que sin este trigger la aplicacion SI podria
-- modificar o borrar registros de auditoria de su propio tenant.
-- El trigger bloquea UPDATE/DELETE incondicionalmente, incluso para
-- el rol propietario de la tabla.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log es de solo lectura tras insertar: operacion % no permitida', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
