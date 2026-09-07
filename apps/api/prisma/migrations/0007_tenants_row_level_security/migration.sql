-- CoffeeOS Enterprise -- RLS explicito para la tabla raiz tenants.
--
-- `tenants` necesita dos comportamientos distintos:
--   1. Antes del login, la API debe resolver un identificador (slug)
--      para descubrir el tenant_id y poder activar el contexto RLS.
--   2. Toda escritura debe limitarse al tenant_id fijado dentro de la
--      transaccion mediante app.current_tenant.
--
-- El rol coffeeos_app solo existe en el servidor. Los roles publicos
-- de Supabase (anon/authenticated) no reciben estas politicas.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_lookup_tenants ON tenants;
DROP POLICY IF EXISTS tenant_insert_tenants ON tenants;
DROP POLICY IF EXISTS tenant_update_tenants ON tenants;
DROP POLICY IF EXISTS tenant_delete_tenants ON tenants;

-- Permite resolver slug/id antes de conocer el contexto. La API no
-- expone un endpoint publico para enumerar Tenants.
CREATE POLICY tenant_lookup_tenants ON tenants
    FOR SELECT
    TO coffeeos_app
    USING (true);

-- TenantProvisioningService genera el UUID y ejecuta set_config()
-- antes del INSERT, por lo que solo puede crear exactamente esa fila.
CREATE POLICY tenant_insert_tenants ON tenants
    FOR INSERT
    TO coffeeos_app
    WITH CHECK (
        id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE POLICY tenant_update_tenants ON tenants
    FOR UPDATE
    TO coffeeos_app
    USING (
        id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    )
    WITH CHECK (
        id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );

CREATE POLICY tenant_delete_tenants ON tenants
    FOR DELETE
    TO coffeeos_app
    USING (
        id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    );
