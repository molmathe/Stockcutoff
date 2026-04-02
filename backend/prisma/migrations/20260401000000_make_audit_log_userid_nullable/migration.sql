-- Make AuditLog.userId nullable so failed logins from non-existent users
-- can be recorded without a foreign-key constraint violation.

ALTER TABLE "AuditLog" ALTER COLUMN "userId" DROP NOT NULL;
