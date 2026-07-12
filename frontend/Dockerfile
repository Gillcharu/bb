# Frontend image for the npm workspaces monorepo.
# Build context is the REPOSITORY ROOT (see docker-compose.yml), because the
# single source-of-truth package-lock.json lives only at the root. Build with:
#   docker build -f frontend/Dockerfile -t bb-frontend .
#
# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Vite inlines VITE_* variables at build time.
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

# Install all workspace dependencies from the root lockfile (all three manifests
# required for `npm ci` to validate against the lock). The lockfile already
# resolves the React 19 / lucide-react peer set, so `npm ci` needs no
# --legacy-peer-deps.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace frontend --include-workspace-root

# Build only the frontend workspace.
COPY frontend/ ./frontend/
RUN npm run build --workspace frontend

# ---- Production stage: static files served by nginx ----
FROM nginx:1.27-alpine AS production
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
