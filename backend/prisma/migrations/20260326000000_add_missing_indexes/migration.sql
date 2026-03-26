-- AddIndex: User.branchId
CREATE INDEX IF NOT EXISTS "User_branchId_idx" ON "User"("branchId");

-- AddIndex: Item.sku
CREATE INDEX IF NOT EXISTS "Item_sku_idx" ON "Item"("sku");

-- AddIndex: Bill.userId
CREATE INDEX IF NOT EXISTS "Bill_userId_idx" ON "Bill"("userId");
