-- DropIndex
DROP INDEX IF EXISTS "Branch_accessToken_key";

-- AlterTable
ALTER TABLE "Branch" DROP COLUMN IF EXISTS "accessToken";
