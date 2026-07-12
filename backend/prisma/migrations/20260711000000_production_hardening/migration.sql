-- Production hardening migration
-- 1. Track anti-sniping overtime extensions on the auction row
ALTER TABLE "Auction" ADD COLUMN "extensionCount" INTEGER NOT NULL DEFAULT 0;

-- 2. Uniqueness constraints
--    A vendor can only be invited to a given auction once.
CREATE UNIQUE INDEX "Participant_auctionId_vendorId_key" ON "Participant"("auctionId", "vendorId");
--    Template versions are strictly unique per type.
CREATE UNIQUE INDEX "DocumentTemplate_type_version_key" ON "DocumentTemplate"("type", "version");
--    One acceptance record per vendor, auction and document version.
CREATE UNIQUE INDEX "VendorAcceptance_vendorId_auctionId_documentId_key" ON "VendorAcceptance"("vendorId", "auctionId", "documentId");

-- 3. Indexes for hot query paths
CREATE INDEX "Auction_companyId_state_idx" ON "Auction"("companyId", "state");
CREATE INDEX "Auction_state_enabled_idx" ON "Auction"("state", "enabled");
CREATE INDEX "Bid_auctionId_effectiveTotal_idx" ON "Bid"("auctionId", "effectiveTotal");
CREATE INDEX "Bid_auctionId_timestamp_idx" ON "Bid"("auctionId", "timestamp");
CREATE INDEX "Bid_participantId_idx" ON "Bid"("participantId");
CREATE INDEX "Participant_vendorId_idx" ON "Participant"("vendorId");
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "VendorAcceptance_auctionId_idx" ON "VendorAcceptance"("auctionId");
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");
