# CoffeeOS Enterprise -- Web (Fase 1 v1.7)
FROM node:20-alpine AS base
WORKDIR /app
# Fase 1 v1.7, correccion #2: mismo criterio que apps/api/Dockerfile --
# preparado para `npm ci`, pendiente del package-lock.json real.
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/next.config.js ./next.config.js
EXPOSE 3000
CMD ["npm", "run", "start"]
