-- CreateTable
CREATE TABLE "BranchTarget" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "target" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchTarget_year_month_idx" ON "BranchTarget"("year", "month");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "BranchTarget_branchId_year_month_key" ON "BranchTarget"("branchId", "year", "month");

-- AddForeignKey
ALTER TABLE "BranchTarget" ADD CONSTRAINT "BranchTarget_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
