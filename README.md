# Black Box Auction Hub

Enterprise E-Auction Management System designed for Black Box Limited. This platform handles highly concurrent, secure, and real-time reverse bidding workflows for corporate procurement.

---

## Technical Features

### 🛡️ Enterprise-Grade Security & Audit
- **Cryptographic Bidding Ledger (Tamper-Evidence)**: Every bid submitted is cryptographically linked to the previous bid using SHA-256 chaining. Any manual database alteration invalidates the chain, making database tampering immediately visible.
- **Granular RBAC**: Middleware authorization enforcing strict Role-Based Access Control (RBAC) across five organizational roles: `SYSTEM_ADMIN`, `AUCTION_OWNER`, `APPROVER`, `OBSERVER`, and `VENDOR`.
- **System-wide Audit Logs**: Automatic transaction logging capturing actor metadata, operation payloads, timestamps, and request IP addresses.

### ⚡ Real-Time Coordination & Scaling
- **Websocket Broadcast Engine**: Instant bidirectional sync via Socket.IO, pushing bid lists, timer synchronizations, and ranking changes to connected clients in under 1 second.
- **Anti-Sniping Overtime Rules**: Automated time extension triggers (e.g. extending by 5 minutes if a bid is placed in the final 3 minutes) preventing auction sniping tactics.
- **Transactional Row Locking**: Prevents race conditions and duplicate ranking values when multiple bidders submit entries at the exact same millisecond.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand, Recharts, Framer Motion
- **Backend API**: Node.js, Express, TypeScript, Socket.IO
- **Database Layer**: PostgreSQL managed by Prisma ORM
- **Cache & Message Broker**: Redis (for horizontal socket scaling and fast lookups)
- **Infrastructure**: Docker & Docker Compose

---

## Installation & Setup

### 1. Prerequisites
- Docker & Docker Compose installed (recommended)
- *OR* PostgreSQL v16 and Node.js v20 installed locally

### 2. Configure Environment Variables
Copy and configure the environment variables in both the root and `backend/` directories:
```env
DATABASE_URL="postgresql://charugill@localhost:5432/postgres?schema=public"
JWT_SECRET="supersecretjwtkeyforblackboxauctionhub2026!"
JWT_REFRESH_SECRET="supersecretjwtrefreshkeyforblackboxauctionhub2026!"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
```

### 3. Containerized Setup (Recommended)
Build and run the entire application stack (API server, frontend static builder, database, and Redis cache) using Docker Compose:
```bash
# Build and run containers
docker compose up --build -d

# Run migrations and seed inside the container
docker compose exec backend npx prisma migrate dev --name init
docker compose exec backend npx prisma db seed
```
- Frontend will be accessible at: `http://localhost:3000`
- Backend API will be accessible at: `http://localhost:4000`

### 4. Alternative Local Setup (No Docker)
```bash
# Install root package dependencies
npm install --legacy-peer-deps

# Create tables and generate Prisma Client
npx prisma migrate dev --name init --schema=backend/prisma/schema.prisma

# Seed the database
npx prisma db seed --schema=backend/prisma/schema.prisma

# Start the dev servers
npm run dev
```

---

## Seeding & Test Accounts

The following credentials are created during the seed process for evaluation:

| Role | Email | Password |
| --- | --- | --- |
| System Admin | `admin@blackboxlimited.com` | `Password123!` |
| Auction Owner | `owner@blackboxlimited.com` | `Password123!` |
| Approver | `approver@blackboxlimited.com` | `Password123!` |
| Observer | `observer@blackboxlimited.com` | `Password123!` |
| Vendor | `vendor1@supplier.com` | `Password123!` |

---

## Automated Verification Tests

Run the core auth, RBAC middleware, and integration test suite:
```bash
npm test --workspace backend
```
