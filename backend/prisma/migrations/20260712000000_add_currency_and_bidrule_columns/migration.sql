-- Repair migration drift: these columns exist in schema.prisma but were never
-- created by a migration, so auction queries failed with "column does not exist".
ALTER TABLE "Auction" ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE "BidRuleSnapshot" ADD COLUMN "minDecrement" DECIMAL(12,2) NOT NULL DEFAULT 100.00;
ALTER TABLE "BidRuleSnapshot" ADD COLUMN "auctionType" TEXT NOT NULL DEFAULT 'REVERSE';
ALTER TABLE "BidRuleSnapshot" ADD COLUMN "overtimeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BidRuleSnapshot" ADD COLUMN "overtimeWindowMins" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "BidRuleSnapshot" ADD COLUMN "overtimeExtensionMins" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "BidRuleSnapshot" ADD COLUMN "overtimeTriggerRank" TEXT NOT NULL DEFAULT 'RANK_1';
ALTER TABLE "BidRuleSnapshot" ADD COLUMN "maxExtensions" INTEGER;
ALTER TABLE "BidRuleSnapshot" ADD COLUMN "rankVisibility" TEXT NOT NULL DEFAULT 'OWN_RANK_ONLY';
