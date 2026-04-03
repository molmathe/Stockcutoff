-- AlterTable
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "accessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_accessToken_key" ON "Branch"("accessToken");
