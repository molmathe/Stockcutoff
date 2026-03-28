-- Bootstrap the current application schema for fresh databases.
-- The repo started tracking Prisma migrations after tables already existed,
-- so this baseline must be safe to apply on both empty and partially existing DBs.

DO $$
BEGIN
  CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'SUBMITTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "BranchType" AS ENUM ('PERMANENT', 'TEMPORARY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "Category" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'CASHIER',
  "branchId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Branch" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "address" TEXT,
  "phone" TEXT,
  "pincode" TEXT,
  "type" "BranchType" NOT NULL DEFAULT 'PERMANENT',
  "reportBranchId" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Item" (
  "id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT,
  "defaultPrice" DECIMAL(10,2) NOT NULL,
  "category" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "saleDate" TIMESTAMP(3),
  CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Bill" (
  "id" TEXT NOT NULL,
  "billNumber" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
  "source" TEXT NOT NULL DEFAULT 'POS',
  "importPlatform" TEXT,
  "saleDate" TIMESTAMP(3),
  "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),
  CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BillItem" (
  "id" TEXT NOT NULL,
  "billId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "price" DECIMAL(10,2) NOT NULL,
  "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ImportDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "rowsData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "detail" JSONB,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlockedBarcode" (
  "id" TEXT NOT NULL,
  "barcode" TEXT NOT NULL,
  "reason" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlockedBarcode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UnresolvedSale" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "saleDate" TEXT,
  "rawDate" TEXT,
  "rawBranch" TEXT,
  "rawItem" TEXT,
  "qty" INTEGER NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errors" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UnresolvedSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Promotion" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "buyQty" INTEGER NOT NULL,
  "freeQty" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "saleDate" TIMESTAMP(3);

ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "importPlatform" TEXT;
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "Item_sku_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE INDEX IF NOT EXISTS "User_branchId_idx" ON "User"("branchId");

CREATE UNIQUE INDEX IF NOT EXISTS "Branch_code_key" ON "Branch"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_pincode_key" ON "Branch"("pincode");
CREATE INDEX IF NOT EXISTS "Branch_deletedAt_idx" ON "Branch"("deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Item_barcode_key" ON "Item"("barcode");
CREATE INDEX IF NOT EXISTS "Item_sku_idx" ON "Item"("sku");
CREATE INDEX IF NOT EXISTS "Item_category_active_idx" ON "Item"("category", "active");
CREATE INDEX IF NOT EXISTS "Item_active_idx" ON "Item"("active");
CREATE INDEX IF NOT EXISTS "Item_name_idx" ON "Item"("name");

CREATE UNIQUE INDEX IF NOT EXISTS "Bill_billNumber_key" ON "Bill"("billNumber");
CREATE INDEX IF NOT EXISTS "Bill_userId_idx" ON "Bill"("userId");
CREATE INDEX IF NOT EXISTS "Bill_branchId_status_createdAt_idx" ON "Bill"("branchId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Bill_status_createdAt_idx" ON "Bill"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Bill_saleDate_idx" ON "Bill"("saleDate");

CREATE INDEX IF NOT EXISTS "BillItem_billId_idx" ON "BillItem"("billId");
CREATE INDEX IF NOT EXISTS "BillItem_itemId_idx" ON "BillItem"("itemId");

CREATE INDEX IF NOT EXISTS "ImportDraft_userId_idx" ON "ImportDraft"("userId");

CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

CREATE UNIQUE INDEX IF NOT EXISTS "BlockedBarcode_barcode_key" ON "BlockedBarcode"("barcode");
CREATE INDEX IF NOT EXISTS "BlockedBarcode_barcode_idx" ON "BlockedBarcode"("barcode");

CREATE INDEX IF NOT EXISTS "UnresolvedSale_status_idx" ON "UnresolvedSale"("status");
CREATE INDEX IF NOT EXISTS "UnresolvedSale_userId_idx" ON "UnresolvedSale"("userId");

DO $$
BEGIN
  IF to_regclass('"Branch"') IS NOT NULL
    AND to_regclass('"User"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_branchId_fkey') THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL
    AND to_regclass('"AuditLog"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey') THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"Branch"') IS NOT NULL
    AND to_regclass('"Bill"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Bill_branchId_fkey') THEN
    ALTER TABLE "Bill"
      ADD CONSTRAINT "Bill_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL
    AND to_regclass('"Bill"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Bill_userId_fkey') THEN
    ALTER TABLE "Bill"
      ADD CONSTRAINT "Bill_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"Bill"') IS NOT NULL
    AND to_regclass('"BillItem"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillItem_billId_fkey') THEN
    ALTER TABLE "BillItem"
      ADD CONSTRAINT "BillItem_billId_fkey"
      FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"Item"') IS NOT NULL
    AND to_regclass('"BillItem"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BillItem_itemId_fkey') THEN
    ALTER TABLE "BillItem"
      ADD CONSTRAINT "BillItem_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL
    AND to_regclass('"ImportDraft"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ImportDraft_userId_fkey') THEN
    ALTER TABLE "ImportDraft"
      ADD CONSTRAINT "ImportDraft_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL
    AND to_regclass('"UnresolvedSale"') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UnresolvedSale_userId_fkey') THEN
    ALTER TABLE "UnresolvedSale"
      ADD CONSTRAINT "UnresolvedSale_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
