# CoffeeOS Enterprise — Convenciones (vigentes en Fase 1 v1.8)

Consolida las convenciones ya aprobadas en los Libros 03-05. No introduce reglas nuevas.

## Base de datos
- Tablas: inglés, plural, snake_case (`audit_log`, `sales_orders`).
- Claves primarias: UUID (v7 preferente, v4 aceptable). Nunca autoincrementales.
- Columnas obligatorias en tablas operativas: `tenant_id`, `created_at`, `updated_at`, `deleted_at` (soft delete), `version` (optimistic locking).
- Toda tabla con `tenant_id` debe tener RLS habilitado en la misma migración que la crea (ADR-005).

## API
- Propiedades en camelCase.
- Prefijo de versión: `/api/v1/`.
- Eventos de dominio en pasado (`OrderCreated`, `CashOpened`).

## Identificadores de documentación
- Casos de uso: `UC-[MOD]-NNN`.
- Reglas de negocio: `RN-[MOD]-NNN`.
- Épicas: `EP-[MOD]-NNN`. Historias de usuario: `US-[MOD]-NNN`.
- `[MOD]` usa el nombre corto del módulo tal como aparece en `apps/api/src/modules/`.

## Git
- Ramas: `feature/<módulo>/<descripción>`, `release/<versión>`, `hotfix/<descripción>`.
- Commits: Conventional Commits (`feat(sales-pos): ...`, `fix(inventory): ...`).

## Módulos NestJS
- Un módulo de Nest por Bounded Context, bajo `apps/api/src/modules/<bc>/`.
- Ningún módulo importa el PrismaClient directamente — siempre a través de `PrismaService.withTenantContext()`.
- Ningún repositorio ni servicio de módulo omite el `TenantContext`.
