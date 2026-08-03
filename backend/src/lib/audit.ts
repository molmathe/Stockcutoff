import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { clientIp } from './clientIp';

interface AuditParams {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  detail?: object;
  ip?: string;
}

export const logAudit = async (params: AuditParams) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        detail: params.detail,
        ip: params.ip,
      } as Prisma.AuditLogUncheckedCreateInput,
    });
  } catch (e) {
    console.error('Audit log write failed:', e);
  }
};

// Resolved the same way as for rate limiting, so audit entries and limiter buckets
// agree on who the caller is. The previous implementation read the left-most
// X-Forwarded-For entry, which the caller supplies, letting anyone write a chosen
// address into the log — including on LOGIN_FAILED records.
export const getClientIp = (req: Request): string => clientIp(req) ?? '';
