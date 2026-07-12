-- Second hardening pass
-- 1. Refresh-token invalidation on logout: tokens embed the user's current
--    tokenVersion; logout increments it, invalidating all outstanding tokens.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- 2. Company-scoped document templates. Legacy rows (NULL companyId) are
--    treated as invisible and must be recreated by their owning company.
--    Drop the old global (type, version) uniqueness in favour of a
--    per-company constraint.
DROP INDEX IF EXISTS "DocumentTemplate_type_version_key";

ALTER TABLE "DocumentTemplate" ADD COLUMN "companyId" TEXT;

ALTER TABLE "DocumentTemplate"
  ADD CONSTRAINT "DocumentTemplate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DocumentTemplate_companyId_idx" ON "DocumentTemplate"("companyId");

CREATE UNIQUE INDEX "DocumentTemplate_companyId_type_version_key"
  ON "DocumentTemplate"("companyId", "type", "version");
