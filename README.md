# Black Box Auction Hub

Enterprise E-Auction Management System. This platform handles highly concurrent, secure, and real-time **Forward** and **Reverse** bidding workflows for corporate procurement and sales asset liquidation.

---

## Technical Features

### Enterprise-Grade Security & Audit
- **Cryptographic Bidding Ledger (Tamper-Evidence)**: Every bid is cryptographically linked to the previous bid using SHA-256 chaining. Any manual database alteration invalidates the chain, making tampering immediately visible.
- **Granular RBAC + Company Scoping**: Middleware authorization enforcing strict Role-Based Access Control across five roles (`SYSTEM_ADMIN`, `AUCTION_OWNER`, `APPROVER`, `OBSERVER`, `VENDOR`), with per-company data isolation on every route.
- **Vendor Session Scoping**: Vendor tokens are scoped to a single auction; participation is verified at login, on every REST call, and on every socket join. Vendors never see competitor identities or bid trails.
- **System-wide Audit Logs**: Automatic transaction logging capturing actor metadata, operation payloads, timestamps, and request IP addresses.
- **Rate Limiting**: Per-IP limits on authentication and public endpoints, per-account exponential backoff on failed logins, and per-user bid throttling against bid flooding.

### Real-Time Coordination & Correctness
- **WebSocket Broadcast Engine**: Instant bidirectional sync via Socket.IO. Socket sessions are authenticated at handshake and force-disconnected the moment the JWT expires mid-session.
- **Server-Anchored Countdown**: Every timer pulse carries the authoritative server time; clients compute a clock offset so displayed countdowns never trust the local clock.
- **Anti-Sniping Overtime Rules**: Automated close-time extensions when bids land inside the trigger window, with a configurable hard cap (`maxExtensions`) so extensions cannot be stacked indefinitely.
- **Transactional Row Locking**: Bids are serialized per-auction with `SELECT ... FOR UPDATE` inside a single transaction — decrement validation, ledger insert, and overtime extension are atomic. Ties resolve deterministically to the earlier bid.
- **Decimal Money Math**: All currency arithmetic uses arbitrary-precision decimals end to end; no floating-point drift on money.

---

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Recharts
- **Backend API**: Node.js, Express, TypeScript, Socket.IO, Zod
- **Database Layer**: PostgreSQL managed by Prisma ORM
- **Infrastructure**: Docker & Docker Compose (multi-stage production images; frontend served by nginx)

---

## Installation & Setup

### 1. Prerequisites
- Docker & Docker Compose (recommended), *or* PostgreSQL 16 and Node.js 20 locally.

### 2. Configure Environment Variables
```bash
cp .env.example .env
```
Fill in every value. The backend **fails loudly on startup** if a required variable is missing or still contains a placeholder — there are no silent dev fallbacks in production mode. Generate the JWT secrets with:
```bash
openssl rand -hex 32   # run twice: JWT_SECRET and JWT_REFRESH_SECRET must differ
```

> **Security note:** an earlier revision of this repository committed a real `.env.dev` file. Those secrets must be considered compromised — always generate fresh secrets for any deployment, and consider rewriting the repository history (`git filter-repo`) before making the repo public.

### 3. Containerized Setup (Recommended)
```bash
docker compose up --build -d
```
Database migrations run automatically when the backend container starts (`prisma migrate deploy`). Then create the initial company and admin account (reads the `BOOTSTRAP_*` variables from `.env`):
```bash
docker compose exec backend npx prisma db seed
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000` (health check at `/api/health`)

The database starts **empty** apart from the bootstrap company/admin — there is no demo data. Onboard through the UI: sign in as the admin, change the password, then create users, vendors, and the TERMS / DISCLOSURE / RULES document templates under **Settings** (all three templates are required before an auction can be published).

### 4. Local Setup (No Docker)
```bash
# Backend
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run bootstrap          # first run only
npm run dev

# Frontend (separate terminal)
cd frontend
npm ci
npm run dev
```

### 5. Tests & Builds
```bash
cd backend && npm test && npm run build
cd frontend && npm run build
```

---

## Operational Notes

- **Connection pooling**: tune via the `connection_limit` / `pool_timeout` query parameters on `DATABASE_URL` (compose default: 20/30). Use pgBouncer when running multiple backend instances.
- **Reverse proxies**: set `TRUST_PROXY=true` so rate limiting and audit logs see real client IPs.
- **CORS**: `CORS_ORIGIN` must list exact origins (comma-separated). Wildcards are rejected at startup.
- **Vendor credentials**: publishing an auction generates vendor accounts with cryptographically random passwords. Distribution is out-of-band (SMTP connector); plaintext passwords are never logged or returned by the API.
