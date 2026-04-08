import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

const thaiDayBounds = (dateStr: string) => ({
  start: new Date(`${dateStr}T00:00:00+07:00`),
  end:   new Date(`${dateStr}T23:59:59.999+07:00`),
});

// ─── Critical Alerts ──────────────────────────────────────────────────────────
// GET /api/notifications/critical
// Computed on-the-fly from existing Bill and UnresolvedSale tables.
// No new schema, no mutations — purely read-only.
router.get('/critical', authenticate, requireSuperAdmin, async (_req: AuthRequest, res) => {
  try {
    // Yesterday in Thai timezone (UTC+7)
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const { start: yStart, end: yEnd } = thaiDayBounds(yesterdayStr);

    // OPEN bills from yesterday — should have been submitted before end of day
    const openBills = await prisma.bill.findMany({
      where: {
        status: 'OPEN',
        createdAt: { gte: yStart, lte: yEnd },
      },
      select: {
        branchId: true,
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    // Group by branch for a cleaner alert summary
    const branchMap = new Map<string, { id: string; name: string; code: string; count: number }>();
    for (const bill of openBills) {
      if (!bill.branch) continue;
      const { id, name, code } = bill.branch;
      const existing = branchMap.get(id);
      if (existing) existing.count++;
      else branchMap.set(id, { id, name, code, count: 1 });
    }

    // PENDING unresolved sales
    const pendingUnresolvedCount = await prisma.unresolvedSale.count({
      where: { status: 'PENDING' },
    });

    res.json({
      unclosedBillsYesterday: {
        count: openBills.length,
        branches: Array.from(branchMap.values()),
      },
      pendingUnresolvedSales: {
        count: pendingUnresolvedCount,
      },
    });
  } catch (err) {
    console.error('[notifications] critical error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
