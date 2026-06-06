-- Change AuditLog.userId foreign key from ON DELETE RESTRICT to ON DELETE SET NULL.
-- The column was made nullable in 20260401000000 but the FK action was never updated,
-- so deleting a user with any audit rows (every user has a LOGIN_SUCCESS row) failed
-- with a foreign-key violation. SET NULL matches the Prisma schema and preserves the
-- audit history while dropping only the actor link.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_userId_fkey') THEN
    ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";
  END IF;

  ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END
$$;
