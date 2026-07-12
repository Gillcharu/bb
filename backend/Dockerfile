# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# Run as unprivileged user
USER node

EXPOSE 4000

# Apply pending migrations, then start the compiled server (no dev tooling in prod).
# First-time onboarding is a separate manual step (no shared/default credentials):
#   docker compose exec backend node dist/bootstrap.js
# The development seed (prisma/seed.dev.ts) is excluded via .dockerignore and
# cannot run here anyway: ts-node is not installed (npm ci --omit=dev) and the
# seed refuses NODE_ENV=production.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
