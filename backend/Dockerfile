# Backend image for the npm workspaces monorepo.
# Build context is the REPOSITORY ROOT (see docker-compose.yml), because the
# single source-of-truth package-lock.json lives only at the root. Build with:
#   docker build -f backend/Dockerfile -t bb-backend .
#
# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install all workspace dependencies from the root lockfile. `npm ci` validates
# the lock against every workspace manifest, so all three package.json files
# must be present before it runs (copied first to maximise layer caching).
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace backend --include-workspace-root

# Build only the backend workspace (generate the Prisma client, then compile TS).
COPY backend/ ./backend/
RUN npm run prisma:generate --workspace backend \
 && npm run build --workspace backend

# ---- Production stage ----
FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

# Install ONLY the backend workspace's production dependencies. `prisma` is a
# backend production dependency (needed for `migrate deploy` at startup), so it
# is present here; dev tooling (ts-node, jest, typescript) is not.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev --workspace backend --include-workspace-root \
 && npm cache clean --force

# Generate the Prisma client into the pruned node_modules, then bring in the
# compiled output from the build stage.
COPY backend/prisma ./backend/prisma
RUN npm run prisma:generate --workspace backend
COPY --from=build /app/backend/dist ./backend/dist

# Run as the unprivileged built-in node user.
USER node

EXPOSE 4000
WORKDIR /app/backend

# Apply pending migrations, then start the compiled server (no dev tooling here).
# First-time onboarding is a separate manual step (no shared/default credentials):
#   docker compose exec backend node dist/bootstrap.js
# The development seed (prisma/seed.dev.ts) is excluded via .dockerignore and
# cannot run here anyway: ts-node is not installed and the seed refuses
# NODE_ENV=production.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
