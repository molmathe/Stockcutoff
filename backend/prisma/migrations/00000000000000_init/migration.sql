-- Initial schema: all base tables created before migration tracking began

-- Enums
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BRANCH_ADMIN', 'CASHIER');
CREATE TYPE "BillStatus" AS ENUM ('OPEN', 'SUBMITTED', 'CANCELLED');
CREATE TYPE "BranchType" AS ENUM ('PERMANENT', 'TEMPORARY');

-- CreateTable: Category
CREATE TABLE "Category" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateTable: Branch (without tags/deletedAt — added by later migrations)
CREATE TABLE "Branch" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "code"           TEXT NOT NULL,
    "address"        TEXT,
    "phone"          TEXT,
    "pincode"        TEXT,
    "type"           "BranchType" NOT NULL DEFAULT 'PERMANENT',
    "reportBranchId" TEXT,
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");
CREATE UNIQUE INDEX "Branch_pincode_key" ON "Branch"("pincode");

-- CreateTable: User
CREATE TABLE "User" (
    "id"        TEXT NOT NULL,
    "username"  TEXT NOT NULL,
    "password"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "role"      "Role" NOT NULL DEFAULT 'CASHIER',
    "branchId"  TEXT,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "isSystem"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: Item
CREATE TABLE "Item" (
    "id"           TEXT NOT NULL,
    "sku"          TEXT NOT NULL,
    "barcode"      TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "imageUrl"     TEXT,
    "defaultPrice" DECIMAL(10,2) NOT NULL,
    "category"     TEXT,
    "active"       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "saleDate"     TIMESTAMP(3),
    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Item_barcode_key" ON "Item"("barcode");

-- CreateTable: Bill
CREATE TABLE "Bill" (
    "id"             TEXT NOT NULL,
    "billNumber"     TEXT NOT NULL,
    "branchId"       TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "status"         "BillStatus" NOT NULL DEFAULT 'OPEN',
    "source"         TEXT NOT NULL DEFAULT 'POS',
    "saleDate"       TIMESTAMP(3),
    "subtotal"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountPct"    DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total"          DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "submittedAt"    TIMESTAMP(3),
    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Bill_billNumber_key" ON "Bill"("billNumber");

ALTER TABLE "Bill" ADD CONSTRAINT "Bill_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: BillItem (without globalDiscount — added by migration 20260402000000)
CREATE TABLE "BillItem" (
    "id"       TEXT NOT NULL,
    "billId"   TEXT NOT NULL,
    "itemId"   TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price"    DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: ImportDraft
CREATE TABLE "ImportDraft" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "platform"  TEXT NOT NULL,
    "fileName"  TEXT NOT NULL,
    "rowsData"  JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportDraft_userId_idx" ON "ImportDraft"("userId");

ALTER TABLE "ImportDraft" ADD CONSTRAINT "ImportDraft_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: UnresolvedSale
CREATE TABLE "UnresolvedSale" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "platform"  TEXT NOT NULL,
    "fileName"  TEXT NOT NULL,
    "saleDate"  TEXT,
    "rawDate"   TEXT,
    "rawBranch" TEXT,
    "rawItem"   TEXT,
    "qty"       INTEGER NOT NULL,
    "price"     DECIMAL(10,2) NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'PENDING',
    "errors"    JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UnresolvedSale_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UnresolvedSale_status_idx" ON "UnresolvedSale"("status");
CREATE INDEX "UnresolvedSale_userId_idx" ON "UnresolvedSale"("userId");

ALTER TABLE "UnresolvedSale" ADD CONSTRAINT "UnresolvedSale_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
