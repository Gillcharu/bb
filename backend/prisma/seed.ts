/**
 * Production bootstrap script.
 *
 * Creates the initial company and the first SYSTEM_ADMIN account so the
 * platform can be onboarded through the UI. Reads configuration from the
 * environment — no demo data, no hardcoded credentials.
 *
 * Required environment variables:
 *   BOOTSTRAP_COMPANY_NAME   e.g. "Acme Procurement Ltd"
 *   BOOTSTRAP_ADMIN_EMAIL    e.g. "admin@acme.com"
 *   BOOTSTRAP_ADMIN_PASSWORD initial admin password (min 12 chars; change after first login)
 *
 * Usage: npx prisma db seed   (or: npm run bootstrap)
 * The script is idempotent — it exits without changes if any user already exists.
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

async function main() {
  const companyName = process.env.BOOTSTRAP_COMPANY_NAME;
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

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

  const company = await prisma.company.create({
    data: { name: companyName },
  });

  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_COST);
  await prisma.user.create({
    data: {
      email: adminEmail,
      password: passwordHash,
      role: Role.SYSTEM_ADMIN,
      companyId: company.id,
    },
  });

  console.log(`Bootstrap complete: company "${companyName}" and admin account ${adminEmail} created.`);
  console.log('Next steps: sign in, change the admin password, then create users, vendors and document templates in Settings.');
}

main()
  .catch(e => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
