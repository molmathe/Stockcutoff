-- AlterTable
-- IF NOT EXISTS because the two baseline migrations that run before this one
-- (00000000000000_init and 20260311000000_init_schema) already create Bill with
-- discountPct. Without it this statement aborts on any database built from
-- scratch, which is every restore, new environment and fresh checkout.
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
