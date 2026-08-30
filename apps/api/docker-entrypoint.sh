#!/usr/bin/env sh
# CoffeeOS Enterprise -- entrypoint del contenedor API (Fase 1 v1.7).
#
# Orden, y por que en ese orden (Fase 1 v1.7, correccion #1: TODA la
# validacion de secretos ocurre primero, antes de tocar Postgres --
# antes se validaba APP_DB_ROLE_PASSWORD a mitad de camino, despues
# de pg_isready; ahora falla rapido sin ninguna conexion de red si
# falta algo):
#   1. Validar que DATABASE_URL exista (obligatorio siempre -- sin
#      el, ni siquiera se puede migrar).
#   2. Fail-fast: en Staging/Production, validar que
#      APP_DB_ROLE_PASSWORD tambien exista.
#   3. Esperar a que Postgres acepte conexiones.
#   4. Aplicar migraciones (rol administrador, DATABASE_URL).
#   5. Provisionar la contraseña de coffeeos_app.
#   6. Limpiar del entorno las credenciales administrativas
#      (DATABASE_URL, APP_DB_ROLE_PASSWORD) ANTES de arrancar la
#      aplicacion. Nota importante: validateEnvironmentOrExit() (ver
#      common/config/environment.ts) ya NO exige DATABASE_URL --
#      exigirla ahi era la contradiccion real que esta version
#      corrige: el entrypoint borraba la variable y el proceso Node
#      abortaba un instante despues por su ausencia.
#   7. Arrancar la aplicacion (unicamente con APP_DATABASE_URL).
set -e

NODE_ENV="${NODE_ENV:-development}"

# --- Paso 1: DATABASE_URL es obligatoria en TODOS los ambientes ---
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] FATAL: DATABASE_URL no esta definida. No se puede migrar ni provisionar. Abortando." >&2
  exit 1
fi

# --- Paso 2: fail-fast de secretos en Staging/Production ---
case "$NODE_ENV" in
  staging|production)
    if [ -z "${APP_DB_ROLE_PASSWORD:-}" ]; then
      echo "[entrypoint] FATAL: NODE_ENV=$NODE_ENV requiere APP_DB_ROLE_PASSWORD y no esta definida. Abortando." >&2
      exit 1
    fi
    ;;
esac

# --- Paso 3: esperar Postgres (recien ahora, con todo ya validado) ---
# `schema` es un parametro propio de Prisma y libpq/pg_isready no lo
# reconoce. Para las herramientas nativas de PostgreSQL se elimina
# unicamente ese parametro; DATABASE_URL permanece intacta para Prisma.
POSTGRES_TOOLS_URL="$(
  printf '%s' "$DATABASE_URL" |
    sed -E 's/([?&])schema=[^&]*(&|$)/\1/; s/\?&/?/; s/[?&]$//'
)"
echo "[entrypoint] Esperando a PostgreSQL..."
until pg_isready -d "$POSTGRES_TOOLS_URL" >/dev/null 2>&1; do
  sleep 1
done
echo "[entrypoint] PostgreSQL disponible."

# --- Paso 4: migraciones ---
echo "[entrypoint] Aplicando migraciones..."
npx prisma migrate deploy

# --- Paso 5: provisionar contraseña ---
if [ -n "${APP_DB_ROLE_PASSWORD:-}" ]; then
  echo "[entrypoint] Provisionando contraseña del rol coffeeos_app..."
  ./prisma/provisioning/set-app-role-password.sh
else
  # Solo se llega aqui en Local/Development/Testing -- en
  # Staging/Production ya se aborto en el Paso 2.
  echo "[entrypoint] AVISO: APP_DB_ROLE_PASSWORD no definida -- se omite el" >&2
  echo "[entrypoint] aprovisionamiento de contraseña. Si el rol coffeeos_app" >&2
  echo "[entrypoint] aun no tiene contraseña, la aplicacion NO podra conectarse." >&2
fi

# --- Paso 6: limpiar credenciales administrativas del entorno ---
unset DATABASE_URL
unset APP_DB_ROLE_PASSWORD

# --- Paso 7: arrancar la aplicacion ---
echo "[entrypoint] Iniciando aplicación (conexion runtime: APP_DATABASE_URL unicamente)..."
exec node dist/src/main.js
