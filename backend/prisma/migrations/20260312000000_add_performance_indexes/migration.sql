-- Performance indexes for Bill, BillItem, and Item models
-- Tables already exist; only adding indexes.

-- Bill indexes
CREATE INDEX IF NOT EXISTS "Bill_branchId_status_createdAt_idx" ON "Bill"("branchId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Bill_status_createdAt_idx" ON "Bill"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Bill_saleDate_idx" ON "Bill"("saleDate");

-- BillItem indexes
CREATE INDEX IF NOT EXISTS "BillItem_billId_idx" ON "BillItem"("billId");
CREATE INDEX IF NOT EXISTS "BillItem_itemId_idx" ON "BillItem"("itemId");

-- Item indexes
CREATE INDEX IF NOT EXISTS "Item_category_active_idx" ON "Item"("category", "active");
CREATE INDEX IF NOT EXISTS "Item_active_idx" ON "Item"("active");
CREATE INDEX IF NOT EXISTS "Item_name_idx" ON "Item"("name");
