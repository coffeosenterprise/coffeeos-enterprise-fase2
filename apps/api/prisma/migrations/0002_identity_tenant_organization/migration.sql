-- CoffeeOS Enterprise -- Migracion 0002: Identity, Tenant, Organization (Fase 1)
-- Toda tabla con tenant_id activa RLS en esta misma migracion (ADR-005).
-- Permission es la unica tabla sin tenant_id: es un catalogo global de referencia.

-- ============================================================
-- TENANT & SUBSCRIPTION MANAGEMENT
-- ============================================================

ALTER TABLE tenants ADD COLUMN custom_limits JSONB;

CREATE TABLE feature_flags (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    key        TEXT NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, key)
);
CREATE INDEX idx_feature_flags_tenant_id ON feature_flags (tenant_id);
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_feature_flags ON feature_flags
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- ============================================================
-- ORGANIZATION MANAGEMENT
-- ============================================================

CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,
    tax_id          TEXT,
    currency        TEXT NOT NULL DEFAULT 'MXN',
    timezone        TEXT NOT NULL DEFAULT 'America/Mexico_City',
    base_tax_config JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_companies_tenant_id ON companies (tenant_id);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_companies ON companies
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE branches (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    name       TEXT NOT NULL,
    address    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_branches_tenant_id ON branches (tenant_id);
CREATE INDEX idx_branches_company_id ON branches (company_id);
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_branches ON branches
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE terminals (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    branch_id  UUID NOT NULL REFERENCES branches(id),
    name       TEXT NOT NULL,
    code       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (branch_id, code)
);
CREATE INDEX idx_terminals_tenant_id ON terminals (tenant_id);
ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_terminals ON terminals
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- ============================================================
-- IDENTITY & ACCESS
-- ============================================================

CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id),
    email                 TEXT NOT NULL,
    password_hash         TEXT,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'invited',
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ,
    UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant_id ON users (tenant_id);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Catalogo global -- sin tenant_id, sin RLS (deliberado: es un catalogo
-- de referencia compartido, no un dato operativo de un tenant).
CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL
);

CREATE TABLE roles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    name       TEXT NOT NULL,
    is_system  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name)
);
CREATE INDEX idx_roles_tenant_id ON roles (tenant_id);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_roles ON roles
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE role_permissions (
    tenant_id     UUID NOT NULL REFERENCES tenants(id),
    role_id       UUID NOT NULL REFERENCES roles(id),
    permission_id UUID NOT NULL REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX idx_role_permissions_tenant_id ON role_permissions (tenant_id);
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_role_permissions ON role_permissions
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE user_roles (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    user_id   UUID NOT NULL REFERENCES users(id),
    role_id   UUID NOT NULL REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_tenant_id ON user_roles (tenant_id);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_user_roles ON user_roles
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE user_branch_assignments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    user_id    UUID NOT NULL REFERENCES users(id),
    branch_id  UUID NOT NULL REFERENCES branches(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, branch_id)
);
CREATE INDEX idx_uba_tenant_id ON user_branch_assignments (tenant_id);
ALTER TABLE user_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_user_branch_assignments ON user_branch_assignments
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    refresh_token_hash  TEXT NOT NULL,
    user_agent          TEXT,
    ip_address          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ
);
CREATE INDEX idx_sessions_tenant_id ON sessions (tenant_id);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_sessions ON sessions
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE invitations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id),
    email             TEXT NOT NULL,
    role_id           UUID NOT NULL REFERENCES roles(id),
    token_hash        TEXT NOT NULL,
    invited_by_user_id UUID,
    status            TEXT NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL,
    accepted_at       TIMESTAMPTZ
);
CREATE INDEX idx_invitations_tenant_id ON invitations (tenant_id);
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_invitations ON invitations
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE TABLE password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    user_id    UUID NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);
CREATE INDEX idx_prt_tenant_id ON password_reset_tokens (tenant_id);
CREATE INDEX idx_prt_user_id ON password_reset_tokens (user_id);
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_password_reset_tokens ON password_reset_tokens
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- ============================================================
-- SEED: catalogo de permisos base + roles de sistema por tenant
-- (el seed real de roles se ejecuta por tenant al crearse -- ver
--  TenantService.create(); aqui solo se crea el catalogo global
--  de permisos, que no depende de ningun tenant)
-- ============================================================

INSERT INTO permissions (key, description) VALUES
    ('tenant.manage', 'Administrar configuracion del Tenant, plan y feature flags'),
    ('organization.manage', 'Crear y administrar empresas, sucursales y terminales'),
    ('users.manage', 'Invitar, activar, bloquear y administrar usuarios'),
    ('roles.manage', 'Administrar roles y asignacion de permisos'),
    ('audit.read', 'Consultar el historial de auditoria');
