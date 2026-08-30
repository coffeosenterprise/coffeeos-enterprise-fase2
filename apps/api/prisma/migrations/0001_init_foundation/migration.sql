-- CoffeeOS Enterprise — Migracion 0001: fundacion (Fase 0)
-- Crea las tablas transversales minimas y activa RLS de forma
-- experimental sobre audit_log, para validar el patron end-to-end
-- antes de que cualquier modulo de negocio cree sus propias tablas.
-- Referencia: ADR-005 (RLS ratificado), Gate 0 / G0-001.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    plan       TEXT NOT NULL DEFAULT 'starter',
    status     TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE audit_log (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID NOT NULL REFERENCES tenants(id),
    actor_id   UUID,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  UUID,
    payload    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version    INT NOT NULL DEFAULT 1
);

CREATE INDEX idx_audit_log_tenant_id ON audit_log (tenant_id);

-- --- Row-Level Security experimental (G0-001) ---
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- El rol de aplicacion NUNCA debe tener BYPASSRLS (ADR-005).
-- Esta politica exige que app.current_tenant este definido y
-- coincida exactamente con tenant_id, tanto para lectura (USING)
-- como para escritura (WITH CHECK).
CREATE POLICY tenant_isolation_audit_log ON audit_log
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
