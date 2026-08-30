-- CoffeeOS Enterprise -- Migracion 0005: proteger tablas internas del rol de aplicacion
-- Fase 1 v1.8, correccion #2.
--
-- El GRANT de la migracion 0004 (`GRANT SELECT, INSERT, UPDATE,
-- DELETE ON ALL TABLES IN SCHEMA public TO coffeeos_app`) se ejecuto
-- ANTES de que existiera esta migracion -- y en ese punto,
-- `_prisma_migrations` (tabla que el propio motor de Prisma crea
-- automaticamente para llevar su historial de migraciones aplicadas)
-- ya existia en el esquema `public`, porque Prisma la crea al
-- aplicar la primera migracion. Ese GRANT amplio, sin quererlo, le
-- dio a `coffeeos_app` permiso para escribir en su propio historial
-- de migraciones -- el runtime de la aplicacion nunca deberia poder
-- alterar que migraciones se consideran aplicadas.
--
-- Revision de otras tablas "internas o de infraestructura" (no de
-- negocio) en el esquema hasta esta migracion: `_prisma_migrations`
-- es la unica. `permissions` y `audit_log` ya quedaron protegidas en
-- la propia migracion 0004. El resto de las tablas son datos de
-- negocio genuinos que la aplicacion si necesita escribir.

REVOKE INSERT, UPDATE, DELETE ON "_prisma_migrations" FROM coffeeos_app;

-- Nota para futuras migraciones: si se introduce alguna otra tabla
-- de infraestructura/bookkeeping (no de negocio), su migracion debe
-- incluir el mismo REVOKE explicito -- el GRANT amplio de la
-- migracion 0004 sigue siendo el comportamiento por defecto para
-- tablas nuevas (via ALTER DEFAULT PRIVILEGES), asi que cualquier
-- excepcion debe declararse activamente, no asumirse.
