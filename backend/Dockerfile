# ---- Build stage ----
FROM node:20-alpine AS build
# Prisma engines are dynamically linked against OpenSSL, absent from node:alpine.
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace backend --include-workspace-root

COPY backend/ ./backend/
RUN npm run prisma:generate --workspace backend \
 && npm run build --workspace backend

# ---- Production stage ----
FROM node:20-alpine AS production
# OpenSSL is needed at runtime too (Prisma query engine + migrate deploy).
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root \
 && npm cache clean --force

COPY backend/prisma ./backend/prisma
RUN npm run prisma:generate --workspace backend
COPY --from=build /app/backend/dist ./backend/dist

# Let the unprivileged runtime user own the app tree so Prisma can write its
# engine at startup.
RUN chown -R node:node /app

USER node
EXPOSE 4000
WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
