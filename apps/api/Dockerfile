# CoffeeOS Enterprise -- API (Fase 1 v1.7)
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl
# Fase 1 v1.7, correccion #2: preparado para `npm ci`, pendiente de
# que exista un package-lock.json real (no se pudo generar en este
# entorno sin acceso a npm -- ver Documento de Cierre v1.7). El glob
# `package-lock.json*` evita que el build falle mientras el lockfile
# no exista todavia. EN CUANTO se comitee un package-lock.json real,
# el UNICO cambio necesario aqui es la linea siguiente:
#   RUN npm install   ->   RUN npm ci
# No se hizo ese cambio ahora porque, sin el lockfile presente en el
# repositorio, `npm ci` falla incondicionalmente (por diseño de npm)
# -- eso habria dejado el Dockerfile roto en vez de listo.
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# postgresql-client aporta pg_isready y psql -- usados por
# docker-entrypoint.sh y por prisma/provisioning/set-app-role-password.sh
# para automatizar migraciones + aprovisionamiento de contraseña antes
# de arrancar la aplicacion.
RUN apk add --no-cache postgresql-client bash openssl
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh ./prisma/provisioning/set-app-role-password.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
