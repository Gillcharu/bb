/**
 * DEVELOPMENT seed — local/test convenience ONLY.
 *
 * Creates a small, realistic dataset (one company, one account per role, a few
 * vendors, the three compliance templates, and a couple of auctions) so the app
 * can be exercised locally without walking the full onboarding flow by hand.
 *
 * This is deliberately NOT the production bootstrap (see src/bootstrap.ts).
 * It is wired as the Prisma `seed` hook, so `npx prisma db seed` runs it in dev.
 *
 * Three independent safeguards make it impossible to run against production:
 *   1. It aborts if NODE_ENV === 'production'.
 *   2. It aborts if the database already contains any users (never wipes/dupes).
 *   3. It requires ts-node, which is a devDependency and is absent from the
 *      production Docker image (`npm ci --omit=dev`), so the command simply
 *      does not exist there.
 *
 * Every account gets a DISTINCT, randomly generated password, printed to the
 * console once at the end of the run. There is no shared or hardcoded password.
 */
import { PrismaClient, Role, AuctionState } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

// A readable but high-entropy random password (~20 base64url chars).
const genPassword = () => crypto.randomBytes(15).toString('base64url');

async function main() {
  // Safeguard 1: never in production.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the development seed with NODE_ENV=production.');
  }

  // Safeguard 2: never against a database that already holds data.
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log('Dev seed skipped: the database already contains user accounts.');
    return;
  }

  const credentials: { role: string; email: string; password: string }[] = [];

  const company = await prisma.company.create({
    data: { name: 'Dev Company Ltd', primaryColor: '#0B2447', accentColor: '#1B5A9E' },
  });

  // One account per staff role, each with its own random password.
  const staff: { email: string; role: Role }[] = [
    { email: 'admin@dev.local', role: Role.SYSTEM_ADMIN },
    { email: 'owner@dev.local', role: Role.AUCTION_OWNER },
    { email: 'approver@dev.local', role: Role.APPROVER },
    { email: 'observer@dev.local', role: Role.OBSERVER },
  ];

  const staffRecords: Record<string, { id: string }> = {};
  for (const s of staff) {
    const password = genPassword();
    const user = await prisma.user.create({
      data: {
        email: s.email,
        password: await bcrypt.hash(password, BCRYPT_COST),
        role: s.role,
        companyId: company.id,
      },
    });
    staffRecords[s.role] = user;
    credentials.push({ role: s.role, email: s.email, password });
  }

  // A few vendors, each with a vendor-master record AND a login account.
  const vendorSeeds = [
    { name: 'Supplier Alpha', email: 'alpha@vendor.local' },
    { name: 'Supplier Beta', email: 'beta@vendor.local' },
    { name: 'Supplier Gamma', email: 'gamma@vendor.local' },
  ];

  const vendors: { id: string; email: string; name: string }[] = [];
  for (const v of vendorSeeds) {
    const password = genPassword();
    await prisma.user.create({
      data: {
        email: v.email,
        password: await bcrypt.hash(password, BCRYPT_COST),
        role: Role.VENDOR,
        companyId: company.id,
      },
    });
    const vendor = await prisma.vendor.create({
      data: { name: v.name, email: v.email, companyId: company.id },
    });
    vendors.push(vendor);
    credentials.push({ role: 'VENDOR', email: v.email, password });
  }

  // Compliance templates (required before an auction can be published).
  for (const [type, content] of [
    ['TERMS', 'Development Terms and Conditions. By bidding you agree to the stated conditions.'],
    ['DISCLOSURE', 'Development conflict-of-interest disclosure. Bidding information is confidential.'],
    ['RULES', 'Development bidding rules. Server time is authoritative. Decrements must meet the minimum.'],
  ] as const) {
    await prisma.documentTemplate.create({
      data: { type, version: 1, content, companyId: company.id },
    });
  }

  const owner = staffRecords[Role.AUCTION_OWNER];
  const approver = staffRecords[Role.APPROVER];

  // A DRAFT auction (edit/approval flow) and a LIVE one (bidding console).
  await prisma.auction.create({
    data: {
      title: 'Sample Draft — Laptop Procurement',
      description: 'Draft auction for exercising the wizard and approval flow.',
      state: AuctionState.DRAFT,
      companyId: company.id,
      ownerId: owner.id,
      approverId: approver.id,
      baseCurrency: 'INR',
      bidRuleSnapshot: {
        create: { conversionRate: 1, loadingPercent: 0, fixedLoading: 0, minDecrement: 1000 },
      },
    },
  });

  const liveAuction = await prisma.auction.create({
    data: {
      title: 'Sample Live — Network Switch Procurement',
      description: 'Live reverse auction for exercising the bidding console.',
      state: AuctionState.LIVE,
      startAt: new Date(Date.now() - 60 * 60 * 1000),
      endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      enabled: true,
      companyId: company.id,
      ownerId: owner.id,
      approverId: approver.id,
      baseCurrency: 'INR',
      bidRuleSnapshot: {
        create: { conversionRate: 1, loadingPercent: 5, fixedLoading: 500, minDecrement: 25000 },
      },
    },
  });

  // Map the first two vendors into the live auction as accepted participants.
  for (const v of vendors.slice(0, 2)) {
    await prisma.participant.create({
      data: {
        auctionId: liveAuction.id,
        vendorId: v.id,
        invitedAt: new Date(),
        acceptedTerms: true,
      },
    });
  }

  // Print the generated credentials once. Never persisted anywhere.
  console.log('\nDev seed complete. Generated credentials (shown once):\n');
  console.log('  ROLE            EMAIL                  PASSWORD');
  console.log('  ----            -----                  --------');
  for (const c of credentials) {
    console.log(`  ${c.role.padEnd(15)} ${c.email.padEnd(22)} ${c.password}`);
  }
  console.log('\nStore these in your password manager; they are not recoverable later.\n');
}

main()
  .catch(e => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
