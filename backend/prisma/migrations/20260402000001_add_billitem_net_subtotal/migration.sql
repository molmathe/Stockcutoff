-- AlterTable: add netSubtotal to BillItem
-- Backfill with subtotal (correct for all existing bills that had no bill-level discount,
-- and a best-effort approximation for any that did).
ALTER TABLE "BillItem" ADD COLUMN "netSubtotal" DECIMAL(10,2) NOT NULL DEFAULT 0;
UPDATE "BillItem" SET "netSubtotal" = "subtotal";
