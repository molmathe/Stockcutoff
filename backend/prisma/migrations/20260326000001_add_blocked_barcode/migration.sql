CREATE TABLE "BlockedBarcode" (
    "id"        TEXT NOT NULL,
    "barcode"   TEXT NOT NULL,
    "reason"    TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedBarcode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlockedBarcode_barcode_key" ON "BlockedBarcode"("barcode");
CREATE INDEX "BlockedBarcode_barcode_idx" ON "BlockedBarcode"("barcode");
