import { PrismaClient } from '@prisma/client';

// Connection pooling: Prisma's pool size is configured via the DATABASE_URL
// query string, e.g. `?connection_limit=20&pool_timeout=30`. With ~1000
// concurrent bidders the API remains request/response bound, so 20-30 pooled
// connections per instance is sufficient; bids serialize per-auction on a row
// lock, not per-connection. Scale horizontally with a external pooler
// (pgBouncer) if running multiple instances.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});
