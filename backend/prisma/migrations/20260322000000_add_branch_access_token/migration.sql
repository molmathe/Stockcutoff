-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "accessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_accessToken_key" ON "Branch"("accessToken");
