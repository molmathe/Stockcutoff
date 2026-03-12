import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

const buildWhere = (req: AuthRequest, query: any) => {
  const { branchId, startDate, endDate } = query;
  const where: Record<string, any> = { status: 'SUBMITTED' };

  if (req.user!.role === 'BRANCH_ADMIN' && req.user!.branchId) {
    where['branchId'] = req.user!.branchId;
  } else if (branchId) {
    where['branchId'] = branchId;
  }

  if (startDate || endDate) {
    where['createdAt'] = {};
    if (startDate) where['createdAt'].gte = new Date(startDate as string);
    if (endDate) {
      const e = new Date(endDate as string);
      e.setHours(23, 59, 59, 999);
      where['createdAt'].lte = e;
    }
  }
  return where;
};

const branchFilter = (req: AuthRequest): Record<string, any> => {
  if (req.user!.role === 'BRANCH_ADMIN' && req.user!.branchId) {
    return { branchId: req.user!.branchId };
  }
  return {};
};

router.get('/dashboard', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const bw = branchFilter(req);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const todayBills = await prisma.bill.findMany({
      where: { ...bw, status: 'SUBMITTED', createdAt: { gte: today, lt: tomorrow } },
      include: { items: true },
    });

    const todayRevenue = todayBills.reduce((s, b) => s + Number(b.total), 0);
    const todayItemsSold = todayBills.reduce((s, b) => s + b.items.reduce((si, i) => si + i.quantity, 0), 0);

    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const recentBills = await prisma.bill.findMany({
      where: { ...bw, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
    });

    const dayMap: Record<string, { revenue: number; bills: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo); d.setDate(d.getDate() + i);
      dayMap[d.toISOString().split('T')[0]] = { revenue: 0, bills: 0 };
    }
    for (const b of recentBills) {
      const key = b.createdAt.toISOString().split('T')[0];
      if (dayMap[key]) { dayMap[key].revenue += Number(b.total); dayMap[key].bills++; }
    }
    const revenueByDay = Object.entries(dayMap).map(([date, v]) => ({ date, ...v }));

    const allBillsForItems = await prisma.bill.findMany({
      where: { ...bw, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
      include: { items: { include: { item: { select: { name: true, sku: true } } } } },
    });
    const itemMap: Record<string, { name: string; sku: string; qty: number; revenue: number }> = {};
    for (const b of allBillsForItems) {
      for (const bi of b.items) {
        if (!itemMap[bi.itemId]) itemMap[bi.itemId] = { name: bi.item.name, sku: bi.item.sku, qty: 0, revenue: 0 };
        itemMap[bi.itemId].qty += bi.quantity;
        itemMap[bi.itemId].revenue += Number(bi.subtotal);
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    let branchSales: any[] = [];
    if (req.user!.role === 'SUPER_ADMIN') {
      const branches = await prisma.branch.findMany({ where: { active: true } });
      for (const br of branches) {
        const agg = await prisma.bill.aggregate({
          where: { branchId: br.id, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
          _sum: { total: true },
          _count: true,
        });
        branchSales.push({ branch: br.name, revenue: Number(agg._sum.total || 0), bills: agg._count });
      }
    }

    res.json({ todayRevenue, todayBills: todayBills.length, todayItemsSold, revenueByDay, topItems, branchSales });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/sales', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
        items: { include: { item: { select: { id: true, name: true, sku: true, barcode: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalRevenue = bills.reduce((s, b) => s + Number(b.total), 0);
    const itemSummary: Record<string, any> = {};
    for (const b of bills) {
      for (const bi of b.items) {
        if (!itemSummary[bi.itemId]) {
          itemSummary[bi.itemId] = { itemId: bi.itemId, name: bi.item.name, sku: bi.item.sku, qty: 0, revenue: 0 };
        }
        itemSummary[bi.itemId].qty += bi.quantity;
        itemSummary[bi.itemId].revenue += Number(bi.subtotal);
      }
    }

    res.json({
      bills,
      summary: { totalRevenue, totalBills: bills.length, items: Object.values(itemSummary).sort((a, b) => b.revenue - a.revenue) },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/download', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StockCutoff';

    const s1 = wb.addWorksheet('Bills');
    s1.columns = [
      { header: 'Bill Number', key: 'billNumber', width: 22 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Cashier', key: 'cashier', width: 20 },
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Items', key: 'items', width: 8 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'Discount', key: 'discount', width: 14 },
      { header: 'Total', key: 'total', width: 14 },
    ];
    bills.forEach((b) => s1.addRow({
      billNumber: b.billNumber, branch: b.branch.name, cashier: b.user.name,
      date: b.createdAt.toLocaleString(), items: b.items.length,
      subtotal: Number(b.subtotal), discount: Number(b.discount), total: Number(b.total),
    }));

    const s2 = wb.addWorksheet('Item Details');
    s2.columns = [
      { header: 'Bill Number', key: 'bill', width: 22 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Date', key: 'date', width: 18 },
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Barcode', key: 'barcode', width: 18 },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Price', key: 'price', width: 14 },
      { header: 'Discount', key: 'discount', width: 14 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
    ];
    bills.forEach((b) => b.items.forEach((bi) => s2.addRow({
      bill: b.billNumber, branch: b.branch.name, date: b.createdAt.toLocaleString(),
      sku: bi.item.sku, barcode: bi.item.barcode, name: bi.item.name,
      qty: bi.quantity, price: Number(bi.price), discount: Number(bi.discount), subtotal: Number(bi.subtotal),
    })));

    const s3 = wb.addWorksheet('Item Summary');
    s3.columns = [
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Item Name', key: 'name', width: 30 },
      { header: 'Total Qty', key: 'qty', width: 12 },
      { header: 'Total Revenue', key: 'revenue', width: 16 },
    ];
    const itemMap: Record<string, any> = {};
    bills.forEach((b) => b.items.forEach((bi) => {
      if (!itemMap[bi.itemId]) itemMap[bi.itemId] = { sku: bi.item.sku, name: bi.item.name, qty: 0, revenue: 0 };
      itemMap[bi.itemId].qty += bi.quantity;
      itemMap[bi.itemId].revenue += Number(bi.subtotal);
    }));
    Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).forEach((r) => s3.addRow(r));

    [s1, s2, s3].forEach((s) => {
      s.getRow(1).font = { bold: true };
      s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
    });

    const filename = `sales-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
