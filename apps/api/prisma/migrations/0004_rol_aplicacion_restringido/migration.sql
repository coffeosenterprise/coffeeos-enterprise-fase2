-- CoffeeOS Enterprise -- Migracion 0004: rol de aplicacion restringido
--
-- Hallazgo (Fase 1 v1.3): en la imagen oficial de Docker de
-- PostgreSQL, el usuario definido por POSTGRES_USER se crea como
-- SUPERUSER del cluster. Los superusuarios de Postgres SIEMPRE
-- bypassan RLS, sin importar FORCE ROW LEVEL SECURITY -- eso aplica
-- solo al DUENO de la tabla cuando el dueno NO es superusuario. Como
-- este proyecto usaba ese mismo usuario (`coffeeos`) tanto para
-- migraciones como para la conexion en tiempo de ejecucion de la
-- aplicacion, RLS nunca estaba realmente en efecto para la app. Ver
-- ADR-022.
--
-- Fase 1 v1.4, correccion #3: esta migracion crea el rol pero
-- DELIBERADAMENTE NO le asigna contraseña -- un rol LOGIN sin
-- PASSWORD tiene autenticacion por password deshabilitada (no puede
-- conectarse) hasta que algo la establezca explicitamente. La
-- contraseña real se provisiona por FUERA de esta migracion, por
-- ambiente, via `prisma/provisioning/set-app-role-password.sh`
-- (Local/Development/Testing pueden usar un valor de desarrollo
-- controlado que el propio equipo elige; Staging/Production deben
-- usar un secreto gestionado externamente). Ninguna migracion
-- versionada de este repositorio contiene, ni contendra, una
-- contraseña real.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'coffeeos_app') THEN
        CREATE ROLE coffeeos_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO coffeeos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO coffeeos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO coffeeos_app;

-- Privilegios por defecto para tablas que se creen en migraciones
-- FUTURAS (Fase 2 en adelante) sin tener que repetir este GRANT.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO coffeeos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO coffeeos_app;

-- ============================================================
-- Fase 1 v1.4, correccion #4: reduccion de privilegios sobre
-- catalogos globales / tablas que la app no debe escribir en runtime
-- ============================================================

-- `permissions` es un catalogo global sembrado por migracion (ver
-- 0002) -- la aplicacion lo LEE (TenantProvisioningService lo
-- consulta para asignar permisos al rol OWNER), pero nunca debe
-- poder darse de alta, modificar ni borrar permisos por si misma.
-- Cualquier cambio al catalogo de permisos es, por diseño, un cambio
-- de esquema/negocio que debe pasar por una migracion revisada, no
-- una operacion de runtime.
REVOKE INSERT, UPDATE, DELETE ON permissions FROM coffeeos_app;

-- `audit_log` ya es inmutable por trigger (audit_log_immutable,
-- migracion 0003), que aplica a CUALQUIER rol sin excepcion. Esta
-- revocacion es redundante con el trigger a proposito -- doble capa,
-- el mismo principio que ya se aplica a RLS + filtrado de aplicacion
-- (ADR-005): si algun dia el trigger se elimina por error, el
-- permiso de escritura seguiria sin existir.
REVOKE UPDATE, DELETE ON audit_log FROM coffeeos_app;

-- Nota para futuras migraciones (Fase 2 en adelante): cualquier tabla
-- nueva que sea un catalogo global de solo lectura para la app
-- (analoga a `permissions`) debe repetir este mismo patron de REVOKE
-- en la migracion que la crea -- el GRANT por defecto de arriba es
-- deliberadamente amplio (incluye INSERT/UPDATE/DELETE) porque la
-- mayoria de las tablas de negocio SI necesitan escritura desde la
-- app; los catalogos de solo lectura son la excepcion, no la regla,
-- y deben marcarse explicitamente como tal.
