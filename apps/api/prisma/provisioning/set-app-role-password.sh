#!/usr/bin/env bash
# CoffeeOS Enterprise -- Provisiona la contraseña del rol coffeeos_app
# por ambiente (Fase 1 v1.4/v1.5).
#
# Este script NO forma parte del historial de migraciones de Prisma a
# proposito -- el secreto vive en la variable de entorno
# APP_DB_ROLE_PASSWORD (inyectada por el orquestador de secretos de
# cada ambiente), nunca en un archivo versionado.
#
# Fase 1 v1.5, correccion #3: la contraseña ya NO se concatena
# directamente dentro de la sentencia SQL (eso rompia con comillas u
# otros caracteres especiales, y en el peor caso permitia inyeccion
# SQL). Se pasa como variable de psql (`-v`) y se referencia con la
# sintaxis `:'nombre'`, que psql expande aplicando quote_literal()
# automaticamente -- escapa comillas simples y cualquier caracter
# especial de forma segura, sin importar el contenido de la contraseña.
#
# Uso:
#   DATABASE_URL=<conexion admin> APP_DB_ROLE_PASSWORD=<secreto> \
#     ./set-app-role-password.sh
#
# Requiere `psql` disponible en el PATH.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL (conexion con el rol administrador) no esta definida." >&2
  exit 1
fi

if [ -z "${APP_DB_ROLE_PASSWORD:-}" ]; then
  echo "ERROR: APP_DB_ROLE_PASSWORD no esta definida. No se asignara ninguna contraseña por defecto." >&2
  echo "En Local/Development puedes exportar un valor de desarrollo elegido por ti." >&2
  echo "En Staging/Production debe provenir del gestor de secretos del ambiente." >&2
  exit 1
fi

# --set (equivalente a -v) define la variable psql "app_role_password"
# con el valor EXACTO de APP_DB_ROLE_PASSWORD, sin interpretacion de
# shell adicional dentro de psql. La referencia :'app_role_password'
# en el SQL la sustituye como literal SQL correctamente escapado
# (equivalente a quote_literal($APP_DB_ROLE_PASSWORD)).
# `schema` es una extension de la URL de Prisma; libpq/psql no la
# reconoce. Se conserva cualquier otro parametro de conexion.
POSTGRES_TOOLS_URL="$(
  printf '%s' "$DATABASE_URL" |
    sed -E 's/([?&])schema=[^&]*(&|$)/\1/; s/\?&/?/; s/[?&]$//'
)"

psql "$POSTGRES_TOOLS_URL" \
  --set ON_ERROR_STOP=1 \
  --set app_role_password="$APP_DB_ROLE_PASSWORD" <<'SQL'
ALTER ROLE coffeeos_app WITH PASSWORD :'app_role_password';
SQL

echo "Contraseña de coffeeos_app actualizada correctamente."
