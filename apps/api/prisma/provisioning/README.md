# Provisioning fuera de las migraciones de Prisma

Esta carpeta contiene scripts que **deliberadamente no son migraciones de Prisma**, porque necesitan manejar secretos reales que nunca deben quedar versionados en texto plano en el historial de migraciones.

## `set-app-role-password.sh`

Asigna (o rota) la contraseña del rol `coffeeos_app` (creado sin contraseña por la migración `0004_rol_aplicacion_restringido`). Debe correr **una vez por ambiente**, después de aplicar las migraciones y antes de que la aplicación intente conectarse con `APP_DATABASE_URL`.

| Ambiente | Origen de `APP_DB_ROLE_PASSWORD` |
|---|---|
| Local | Valor que el desarrollador elige, exportado en su shell o en un `.env` local (nunca committeado) |
| Development / Testing | Variable de entorno del pipeline de CI (ver `.github/workflows/ci.yml`) — valor de desarrollo controlado, aceptable según el propio criterio de esta fase |
| Staging / Production | Gestor de secretos del ambiente (no definido en este repositorio) |

Después de correr el script, `APP_DATABASE_URL` (usado por `PrismaService`, ver ADR-022) debe reflejar la misma contraseña.
