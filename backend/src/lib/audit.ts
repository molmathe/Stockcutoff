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

export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
};
