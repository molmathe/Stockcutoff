-- Add soft delete support to Branch
ALTER TABLE "Branch" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Branch_deletedAt_idx" ON "Branch"("deletedAt");
