import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/branch-kpi?year=YYYY&month=M
router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const year  = parseInt(req.query.year  as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;

    if (month < 1 || month > 12) return res.status(400).json({ error: 'Invalid month' });

    // Thai UTC+7 start/end of month
    const THAI_OFFSET = 7 * 60 * 60 * 1000;
    const startLocal = new Date(year, month - 1, 1);           // local midnight 1st
    const endLocal   = new Date(year, month,     1);           // local midnight 1st of next month
    // Convert to UTC-stored values: subtract 7h so filtering by createdAt works correctly
    const startUTC = new Date(startLocal.getTime() - THAI_OFFSET);
    const endUTC   = new Date(endLocal.getTime()   - THAI_OFFSET);

    // Active business days in the month (all days 1..last)
    const daysInMonth = new Date(year, month, 0).getDate();

    // Fetch active branches
    const branchFilter = req.user!.role === 'BRANCH_ADMIN' && req.user!.branchId
      ? { id: req.user!.branchId, deletedAt: null }
      : { deletedAt: null };

    const branches = await prisma.branch.findMany({
      where: branchFilter,
      orderBy: { name: 'asc' },
    });

    const branchIds = branches.map(b => b.id);

    // Fetch targets for all branches this month
    const targets = await prisma.branchTarget.findMany({
      where: { branchId: { in: branchIds }, year, month },
    });
    const targetMap: Record<string, string> = {};
    targets.forEach(t => { targetMap[t.branchId] = t.target.toString(); });

    // Fetch SUBMITTED bills in month grouped by branch
    const bills = await prisma.bill.groupBy({
      by: ['branchId'],
      where: {
        branchId: { in: branchIds },
        status: 'SUBMITTED',
        OR: [
          { saleDate: null, createdAt: { gte: startUTC, lt: endUTC } },
          { saleDate: { gte: startUTC, lt: endUTC } },
        ],
      },
      _sum: { total: true },
      _count: { id: true },
    });
    const revenueMap: Record<string, number> = {};
    const countMap: Record<string, number> = {};
    bills.forEach(b => {
      revenueMap[b.branchId] = parseFloat(b._sum.total?.toString() ?? '0');
      countMap[b.branchId]   = b._count.id;
    });

    // Submission days: distinct days that have at least one SUBMITTED bill per branch
    // We'll get all submitted bills in range and count distinct dates per branch
    const submittedBills = await prisma.bill.findMany({
      where: {
        branchId: { in: branchIds },
        status: 'SUBMITTED',
        OR: [
          { saleDate: null, createdAt: { gte: startUTC, lt: endUTC } },
          { saleDate: { gte: startUTC, lt: endUTC } },
        ],
      },
      select: { branchId: true, createdAt: true, saleDate: true },
    });

    const submissionDaysMap: Record<string, Set<string>> = {};
    branchIds.forEach(id => { submissionDaysMap[id] = new Set(); });
    submittedBills.forEach(b => {
      const dateObj = b.saleDate ?? b.createdAt;
      const thaiDate = new Date(dateObj.getTime() + THAI_OFFSET);
      const dayStr = thaiDate.toISOString().split('T')[0];
      submissionDaysMap[b.branchId]?.add(dayStr);
    });

    const result = branches.map(branch => {
      const target  = parseFloat(targetMap[branch.id] ?? '0');
      const actual  = revenueMap[branch.id] ?? 0;
      const achievement = target > 0 ? (actual / target) * 100 : null;
      const submissionDays = submissionDaysMap[branch.id]?.size ?? 0;

      return {
        branchId:        branch.id,
        branchName:      branch.name,
        branchCode:      branch.code,
        target,
        actual,
        achievement,
        submissionDays,
        activeDays:      daysInMonth,
        billCount:       countMap[branch.id] ?? 0,
      };
    });

    res.json({ year, month, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/branch-kpi/:branchId/target
router.put('/:branchId/target', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { branchId } = req.params;
    const { year, month, target } = req.body;

    if (!year || !month || target === undefined) {
      return res.status(400).json({ error: 'year, month, target are required' });
    }
    if (month < 1 || month > 12) return res.status(400).json({ error: 'Invalid month' });
    const targetNum = parseFloat(target);
    if (isNaN(targetNum) || targetNum < 0) return res.status(400).json({ error: 'Invalid target value' });

    const branch = await prisma.branch.findFirst({ where: { id: branchId, deletedAt: null } });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const record = await prisma.branchTarget.upsert({
      where: { branchId_year_month: { branchId, year: parseInt(year), month: parseInt(month) } },
      update: { target: targetNum },
      create: { branchId, year: parseInt(year), month: parseInt(month), target: targetNum },
    });

    res.json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
