-- AlterTable: add globalDiscount column to BillItem
-- Stores the pro-rata share of the global bill-level percentage discount allocated
-- to each line item. Kept separate from `discount` (manual per-line discount) so
-- that the edit flow can round-trip the manual discount cleanly.
ALTER TABLE "BillItem" ADD COLUMN "globalDiscount" DECIMAL(10,2) NOT NULL DEFAULT 0;
