# CoffeeOS Enterprise

Plataforma SaaS Multi-Tenant de administración para negocios F&B (cafeterías, restaurantes, panaderías).

**Estado del proyecto:** Fase 1 v1.8 — Plataforma SaaS Fundamental validada en Docker. Identity & Access, Tenant & Subscription Management, Tenant Provisioning, Organization Management y una interfaz web funcional están implementados. Los módulos de ventas, inventario, producción y reportes permanecen reservados para fases posteriores.

## Interfaz web

La interfaz está disponible en `http://localhost:3001` e incluye:

- creación de un negocio y su usuario propietario;
- inicio, renovación y cierre de sesión;
- panel de estado y actividad;
- creación de empresas, sucursales y terminales;
- consulta de roles e invitación de colaboradores;
- administración del plan, límites y funciones opcionales;
- consulta del historial de auditoría.

El frontend utiliza un proxy interno de Next.js para comunicarse con la API sin exponer problemas de CORS. En Docker, `API_INTERNAL_URL` apunta al servicio `api`.

## Documentación de referencia

Este repositorio implementa las decisiones de los Libros 01-05 (Visión, Catálogo Maestro, Arquitectura, Diseño Técnico, Plan Maestro de Desarrollo) y del Gate 0. El registro formal de decisiones arquitectónicas vive en [`docs/adr/`](./docs/adr) (ADR-001 a ADR-022).

## Estructura

```
apps/
  api/          NestJS -- Monolito Modular (Clean Architecture + DDD)
    prisma/
      migrations/     0001-0005
      provisioning/   scripts fuera del historial de migraciones (secretos, ver mas abajo)
  web/          Next.js -- frontend principal
  web-kds/      reservado para el Kitchen Display System (no escafoldado aun -- no es un workspace todavía)
docs/
  adr/          Registro de decisiones arquitectónicas (ADR-001 a ADR-022)
  CONVENTIONS.md
```

## Requisitos

- Node.js 20+
- Docker y Docker Compose
- `psql` (cliente de PostgreSQL) disponible en el PATH, para el script de aprovisionamiento de contraseña

## Puesta en marcha

> Validación integral realizada el 26 de agosto de 2026: Docker Compose,
> PostgreSQL real, las cinco migraciones Prisma, el rol restringido
> `coffeeos_app`, build, typecheck, lint, auditoría de dependencias, flujo web
> de alta/login y las 42 pruebas unitarias/E2E fueron ejecutados correctamente.

### Opción A — Todo en Docker (recomendada, un solo comando en un entorno limpio)

```bash
export APP_DB_ROLE_PASSWORD=<elige un valor de desarrollo>   # o ponlo en un .env local, no versionado
docker compose up -d
```

`docker compose up -d` por sí solo **ya es suficiente**: el contenedor `api` usa un `docker-entrypoint.sh` que, en orden, (1) espera a que PostgreSQL esté listo, (2) aplica las migraciones — incluida la que crea el rol restringido `coffeeos_app` sin contraseña —, (3) provisiona esa contraseña con `prisma/provisioning/set-app-role-password.sh` usando `APP_DB_ROLE_PASSWORD`, y solo entonces (4) arranca la aplicación. Antes de la v1.5 estos tres primeros pasos había que hacerlos a mano; ya no.

### Opción B — API fuera de Docker (para desarrollo activo del backend)

```bash
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env:
#  - JWT_SECRET real de al menos 32 caracteres si se prueba con
#    NODE_ENV=staging o production (ver common/config/environment.ts).
#  - APP_DATABASE_URL: la contraseña se provisiona en el paso de abajo.

docker compose up -d postgres redis object-storage mail-testing
npm install
npm run prisma:generate --workspace=apps/api
npm run prisma:migrate:deploy --workspace=apps/api

# Manual aquí porque la API corre en el host, no en el contenedor con
# el entrypoint automatizado de la Opción A:
APP_DB_ROLE_PASSWORD=<el mismo valor que en tu .env> \
  DATABASE_URL=postgresql://coffeeos:coffeeos_dev@localhost:5432/coffeeos \
  ./apps/api/prisma/provisioning/set-app-role-password.sh

npm run start:dev --workspace=apps/api
npm run dev --workspace=apps/web
```

## Estado de las decisiones pendientes

Ninguna decisión arquitectónica bloqueante. Registro completo en `docs/adr/`:

- **ADR-019** — Resolución de Tenant en Login/Refresh/tokens públicos (tokens compuestos + slug).
- **ADR-020** — Separación entre administración de Tenant (autoservicio) y de plataforma (deferida).
- **ADR-021** — Capa de orquestación `TenantProvisioningModule`, elimina la dependencia circular Identity ↔ Tenant que existía vía `forwardRef()`.
- **ADR-022** — Rol de base de datos restringido (`coffeeos_app`) para que RLS aplique realmente en tiempo de ejecución, no solo en las migraciones.

## Endpoints principales (Fase 1 v1.8)

```
POST   /api/v1/tenants                          Alta de Tenant + bootstrap atómico del Owner (sin autenticación) — TenantProvisioningController
PATCH  /api/v1/tenants/me/activate               Autoservicio -- opera sobre el Tenant del token, nunca sobre otro
PATCH  /api/v1/tenants/me/suspend
PATCH  /api/v1/tenants/me/plan
GET    /api/v1/tenants/me/limits
GET    /api/v1/tenants/me/feature-flags
POST   /api/v1/tenants/me/feature-flags

POST   /api/v1/users/invite
POST   /api/v1/users/activate                   (sin autenticación -- usa el token de invitación compuesto)
POST   /api/v1/users/:id/block
GET    /api/v1/roles

POST   /api/v1/auth/login                       Requiere tenantSlug + email + password
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh                     Sin autenticación -- el refresh token trae el tenant embebido; rotación atómica
POST   /api/v1/auth/password/recovery           Requiere tenantSlug + email
POST   /api/v1/auth/password/reset              Sin autenticación -- usa el token compuesto
POST   /api/v1/auth/password/change

POST   /api/v1/organization/companies
POST   /api/v1/organization/companies/:companyId/branches
POST   /api/v1/organization/branches/:branchId/terminals
POST   /api/v1/organization/branches/:branchId/users

GET    /health
GET    /metrics
GET    /version
GET    /api/v1/audit
```

**Nota sobre `tenantSlug`:** cada Tenant elige un `slug` único al crearse. Es obligatorio en Login y en la solicitud de recuperación de contraseña, porque el mismo email puede existir en Tenants distintos (ver ADR-019).

**Nota sobre tokens de invitación/recuperación:** en Staging/Production nunca se devuelven en la respuesta HTTP — su entrega es responsabilidad de Notifications, todavía no implementado. En Local/Development/Testing se devuelven para poder probar el flujo completo.

**Nota sobre `POST /tenants`:** vive en `TenantProvisioningController`, no en `TenantsController` — es la única operación que necesita coordinar Identity & Access y Tenant & Subscription Management en una misma transacción (ver ADR-021).
