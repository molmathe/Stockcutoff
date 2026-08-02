import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { Request } from 'express';

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

// Cloudflare overwrites CF-Connecting-IP with the real client address, so it is
// the only header here a caller cannot forge. The left-most X-Forwarded-For entry
// is caller-supplied — reading it let anyone write a chosen IP into the audit log.
export const getClientIp = (req: Request): string => {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.socket?.remoteAddress || '';
};
