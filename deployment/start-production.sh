#!/usr/bin/env sh
set -eu

PUBLIC_PORT="${PORT:-10000}"
API_PID=""
WEB_PID=""

if [ -z "${APP_DATABASE_URL:-}" ]; then
  APP_DATABASE_URL="$(node /app/build-app-db-url.js)"
  export APP_DATABASE_URL
  echo "[production] Conexion restringida de aplicacion derivada de forma segura."
fi

cleanup() {
  if [ -n "${WEB_PID:-}" ]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [ -n "${API_PID:-}" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

echo "[production] Iniciando API interna en el puerto 3000..."
(
  cd /app/api
  PORT=3000 exec ./docker-entrypoint.sh
) &
API_PID=$!

attempt=0
until wget -q -O /dev/null http://127.0.0.1:3000/health; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "[production] FATAL: la API termino durante el arranque." >&2
    wait "$API_PID" || true
    exit 1
  fi

  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then
    echo "[production] FATAL: la API no estuvo lista despues de 120 segundos." >&2
    exit 1
  fi
  sleep 1
done

echo "[production] API lista. Iniciando web en el puerto ${PUBLIC_PORT}..."
(
  cd /app/web
  PORT="$PUBLIC_PORT" \
  HOSTNAME=0.0.0.0 \
  API_INTERNAL_URL=http://127.0.0.1:3000 \
    exec node node_modules/next/dist/bin/next start \
      -H 0.0.0.0 \
      -p "$PUBLIC_PORT"
) &
WEB_PID=$!

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 5
done

if ! kill -0 "$API_PID" 2>/dev/null; then
  echo "[production] FATAL: la API se detuvo inesperadamente." >&2
  wait "$API_PID" || true
  exit 1
fi

wait "$WEB_PID"
