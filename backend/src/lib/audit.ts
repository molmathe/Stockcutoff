import prisma from './prisma';
import { Request } from 'express';

interface AuditParams {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: object;
  ip?: string;
}

export const logAudit = async (params: AuditParams) => {
  try {
    await prisma.auditLog.create({ data: params });
  } catch (e) {
    console.error('Audit log write failed:', e);
  }
};

export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
};
