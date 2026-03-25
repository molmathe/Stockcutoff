import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /audit-logs — SUPER_ADMIN only
router.get('/', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, entity, action, startDate, endDate, page = '1', limit = '50' } = req.query;

    const where: any = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (action) where.action = { contains: action as string, mode: 'insensitive' };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    res.json({ total, page: pageNum, limit: limitNum, logs });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
