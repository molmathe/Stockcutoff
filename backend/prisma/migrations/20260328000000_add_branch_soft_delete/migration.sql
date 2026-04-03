-- Add soft delete support to Branch
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Branch_deletedAt_idx" ON "Branch"("deletedAt");
