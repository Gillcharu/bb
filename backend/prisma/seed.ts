import { PrismaClient, Role, AuctionState } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');
  await prisma.auditLog.deleteMany({});
  await prisma.bid.deleteMany({});
  await prisma.bidRuleSnapshot.deleteMany({});
  await prisma.participant.deleteMany({});
  await prisma.vendorAcceptance.deleteMany({});
  await prisma.documentTemplate.deleteMany({});
  await prisma.auction.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.company.deleteMany({});

  console.log('Seeding Black Box company...');
  const company = await prisma.company.create({
    data: {
      name: 'Black Box',
      primaryColor: '#0B2447',
      accentColor: '#1B5A9E',
      logoUrl: '/assets/logo-placeholder.svg',
    },
  });

  console.log('Seeding users...');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@blackboxlimited.com',
      password: passwordHash,
      role: Role.SYSTEM_ADMIN,
      companyId: company.id,
    },
  });

  const ownerUser = await prisma.user.create({
    data: {
      email: 'owner@blackboxlimited.com',
      password: passwordHash,
      role: Role.AUCTION_OWNER,
      companyId: company.id,
    },
  });

  const approverUser = await prisma.user.create({
    data: {
      email: 'approver@blackboxlimited.com',
      password: passwordHash,
      role: Role.APPROVER,
      companyId: company.id,
    },
  });

  const observerUser = await prisma.user.create({
    data: {
      email: 'observer@blackboxlimited.com',
      password: passwordHash,
      role: Role.OBSERVER,
      companyId: company.id,
    },
  });



  // Vendors as Users (optional for general, but SRS needs Vendor portals)
  const vendorUser = await prisma.user.create({
    data: {
      email: 'vendor1@supplier.com',
      password: passwordHash,
      role: Role.VENDOR,
      companyId: company.id,
    },
  });

  console.log('Seeding vendor master (Supplier Alpha)...');
  const vendor1 = await prisma.vendor.create({
    data: {
      name: 'Supplier Alpha',
      email: 'vendor1@supplier.com',
      companyId: company.id,
    },
  });

  console.log('Seeding additional 999 vendor profiles for scalability testing...');
  const newUsers: any[] = [];
  const newVendors: any[] = [];
  for (let i = 2; i <= 1000; i++) {
    const email = `vendor${i}@supplier.com`;
    const name = i === 2 ? 'Supplier Beta' : `Supplier ${i}`;

    newUsers.push({
      email,
      password: passwordHash,
      role: Role.VENDOR,
      companyId: company.id,
    });

    newVendors.push({
      name,
      email,
      companyId: company.id,
    });
  }

  await prisma.user.createMany({ data: newUsers });
  await prisma.vendor.createMany({ data: newVendors });

  const vendor2 = await prisma.vendor.findUniqueOrThrow({
    where: { email: 'vendor2@supplier.com' }
  });

  console.log('Seeding document templates...');
  const termsDoc = await prisma.documentTemplate.create({
    data: {
      type: 'TERMS',
      version: 1,
      content: 'Standard Black Box Procurement Terms and Conditions. By bidding, you agree to supply materials at the bid price.',
    },
  });

  const disclosureDoc = await prisma.documentTemplate.create({
    data: {
      type: 'DISCLOSURE',
      version: 1,
      content: 'Bidders must disclose any conflicts of interest. Bidding information is confidential.',
    },
  });

  const rulesDoc = await prisma.documentTemplate.create({
    data: {
      type: 'RULES',
      version: 1,
      content: 'Reverse Auction. Decrements must meet the minimum requirement. Server time is the sole authority.',
    },
  });

  console.log('Seeding sample auctions...');

  // 1. Draft Auction
  const draftAuction = await prisma.auction.create({
    data: {
      title: 'UPS and Power Distribution Units - FY26',
      description: 'Reverse e-auction for modular online UPS systems and smart PDUs.',
      state: AuctionState.DRAFT,
      companyId: company.id,
      ownerId: ownerUser.id,
      approverId: approverUser.id,
    },
  });

  // 1b. Pending Approval Auction
  const pendingApprovalAuction = await prisma.auction.create({
    data: {
      title: 'Dell PowerEdge Server Refresh - Gurugram DC',
      description: 'Deployment of high-density rack servers for cloud infrastructure refresh.',
      state: AuctionState.PENDING_APPROVAL,
      companyId: company.id,
      ownerId: ownerUser.id,
      approverId: approverUser.id,
    },
  });

  // 2. Published Auction (Upcoming)
  const publishedAuction = await prisma.auction.create({
    data: {
      title: 'Laptop Procurement - Employee Refresh FY26',
      description: 'Standard corporate model laptops for annual workforce hardware refresh.',
      state: AuctionState.PUBLISHED,
      startAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // starts in 4 days
      endAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      companyId: company.id,
      ownerId: ownerUser.id,
      approverId: approverUser.id,
      enabled: true,
      baseCurrency: 'INR',
    },
  });

  await prisma.bidRuleSnapshot.create({
    data: {
      auctionId: publishedAuction.id,
      conversionRate: 1.0,
      loadingPercent: 0.0,
      fixedLoading: 0.0,
      minDecrement: 10000,
    },
  });

  await prisma.participant.create({
    data: {
      auctionId: publishedAuction.id,
      vendorId: vendor1.id,
      invitedAt: new Date(),
    },
  });

  // 3. Live Auction
  const liveAuction = await prisma.auction.create({
    data: {
      title: 'Cisco Catalyst Switch Procurement - Q3 FY26',
      description: 'Enterprise access switches and chassis switch components.',
      state: AuctionState.LIVE,
      startAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // started 1 hr ago
      endAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // ends in 4 days
      companyId: company.id,
      ownerId: ownerUser.id,
      approverId: approverUser.id,
      enabled: true,
      baseCurrency: 'INR',
    },
  });

  await prisma.bidRuleSnapshot.create({
    data: {
      auctionId: liveAuction.id,
      conversionRate: 1.0,
      loadingPercent: 5.0, // 5% loading for standard handling
      fixedLoading: 500.0, // $500 fixed loading
      minDecrement: 25000,
    },
  });

  const p1 = await prisma.participant.create({
    data: {
      auctionId: liveAuction.id,
      vendorId: vendor1.id,
      invitedAt: new Date(),
      acceptedTerms: true,
    },
  });

  const p2 = await prisma.participant.create({
    data: {
      auctionId: liveAuction.id,
      vendorId: vendor2.id,
      invitedAt: new Date(),
      acceptedTerms: true,
    },
  });

  // Insert initial bids for ranking
  // Formula: (bid * conversion) + fixed + (bid * loading / 100)
  // Bid 1: 1800000
  // Effective 1: (1800000 * 1) + 500 + (1800000 * 0.05) = 1890500
  await prisma.bid.create({
    data: {
      amount: 1800000.0,
      conversionRate: 1.0,
      loadingPercent: 5.0,
      fixedLoading: 500.0,
      effectiveTotal: 1890500.0,
      auctionId: liveAuction.id,
      participantId: p1.id,
      hash: 'initial-hash-p1',
    },
  });

  // Bid 2: 1750000
  // Effective 2: (1750000 * 1) + 500 + (1750000 * 0.05) = 1838000
  await prisma.bid.create({
    data: {
      amount: 1750000.0,
      conversionRate: 1.0,
      loadingPercent: 5.0,
      fixedLoading: 500.0,
      effectiveTotal: 1838000.0,
      auctionId: liveAuction.id,
      participantId: p2.id,
      hash: 'initial-hash-p2',
    },
  });

  // 4. Completed Auction
  const completedAuction = await prisma.auction.create({
    data: {
      title: 'Annual Maintenance Contract - Network Devices FY26',
      description: 'Comprehensive AMC contract for all active network switches and firewalls.',
      state: AuctionState.COMPLETED,
      startAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      endAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      companyId: company.id,
      ownerId: ownerUser.id,
      approverId: approverUser.id,
      enabled: false,
    },
  });

  await prisma.bidRuleSnapshot.create({
    data: {
      auctionId: completedAuction.id,
      conversionRate: 1.0,
      loadingPercent: 0.0,
      fixedLoading: 0.0,
      minDecrement: 10000,
    },
  });

  const pc = await prisma.participant.create({
    data: {
      auctionId: completedAuction.id,
      vendorId: vendor1.id,
      invitedAt: new Date(),
      acceptedTerms: true,
    },
  });

  await prisma.bid.create({
    data: {
      amount: 620000.0,
      conversionRate: 1.0,
      loadingPercent: 0.0,
      fixedLoading: 0.0,
      effectiveTotal: 620000.0,
      auctionId: completedAuction.id,
      participantId: pc.id,
      hash: 'completed-l1-hash',
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
