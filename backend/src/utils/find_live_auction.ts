import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const auctions = await prisma.auction.findMany({
    select: { id: true, title: true, state: true }
  });
  console.log(JSON.stringify(auctions, null, 2));
}
run().catch(console.error);
