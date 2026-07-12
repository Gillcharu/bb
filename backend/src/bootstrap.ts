/**
 * Production bootstrap.
 *
 * Creates the initial company and the first SYSTEM_ADMIN account so the
 * platform can be onboarded through the UI. This is the ONLY script intended to
 * run against a production database, and it is safe by construction:
 *   - It NEVER deletes data.
 *   - It refuses to run if the database already contains any users (idempotent),
 *     so it can never overwrite or duplicate a live account.
 *   - It requires an explicit, strong admin password from the environment —
 *     there is no default or shared credential.
 *
 * It lives under src/ so `tsc` compiles it into dist/, which means it runs in
 * the production Docker image with plain `node` — no ts-node / dev tooling.
 *
 * Required environment variables:
 *   BOOTSTRAP_COMPANY_NAME    e.g. "Acme Procurement Ltd"
 *   BOOTSTRAP_ADMIN_EMAIL     e.g. "admin@acme.com"
 *   BOOTSTRAP_ADMIN_PASSWORD  initial admin password (min 12 chars; change after first login)
 *
 * Usage (local):  npm run bootstrap
 * Usage (Docker): docker compose exec backend node dist/bootstrap.js
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

async function main() {
  const companyName = process.env.BOOTSTRAP_COMPANY_NAME;
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  // Idempotency / safety: refuse to touch a database that already has accounts.
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log('Bootstrap skipped: the database already contains user accounts.');
    return;
  }

  if (!companyName || !adminEmail || !adminPassword) {
    throw new Error(
      'Bootstrap requires BOOTSTRAP_COMPANY_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to be set.'
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL is not a valid email address.');
  }
  if (adminPassword.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const company = await prisma.company.create({ data: { name: companyName } });

  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_COST);
  await prisma.user.create({
    data: {
      email: adminEmail,
      password: passwordHash,
      role: Role.SYSTEM_ADMIN,
      companyId: company.id,
    },
  });

  console.log(`Bootstrap complete: company "${companyName}" and admin ${adminEmail} created.`);
  console.log('Next: sign in, change the admin password, then add users, vendors and document templates in Settings.');
}

main()
  .catch(e => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
