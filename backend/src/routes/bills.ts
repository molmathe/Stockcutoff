import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';

const router = Router();

const generateBillNumber = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `B${date}-${uuidv4().split('-')[0].toUpperCase()}`;
};

// Thai time (UTC+7) day boundaries — avoids server-timezone drift
const getTodayRange = () => {
  const now = new Date();
  const THAI_OFFSET_MS = 7 * 60 * 60 * 1000;
  const thaiNow = new Date(now.getTime() + THAI_OFFSET_MS);
  const thaiDateStr = thaiNow.toISOString().split('T')[0];
  const today = new Date(`${thaiDateStr}T00:00:00+07:00`);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return { today, tomorrow };
};

// GET /bills — list with filters
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { branchId, status, startDate, endDate } = req.query;
    const where: any = {};

    if (req.user!.role === 'CASHIER') {
      where.userId = req.user!.id;
    } else if (req.user!.role === 'BRANCH_ADMIN') {
      where.branchId = req.user!.branchId;
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (status) where.status = status;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
        items: { include: { item: { select: { id: true, name: true, sku: true, barcode: true, imageUrl: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500, // safety cap to prevent OOM on large datasets
    });
    res.json(bills);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /bills/today-summary — summary of today's bills for POS dashboard
router.get('/today-summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { branchId } = req.query;
    const { today, tomorrow } = getTodayRange();

    const where: any = {
      createdAt: { gte: today, lt: tomorrow },
    };

    const effectiveBranchId = (branchId as string) || req.user!.branchId;
    if (effectiveBranchId) where.branchId = effectiveBranchId;
    if (req.user!.role === 'CASHIER') where.userId = req.user!.id;

    const bills = await prisma.bill.findMany({
      where,
      include: {
        items: { include: { item: { select: { id: true, name: true, sku: true, barcode: true, imageUrl: true } } } },
        branch: { select: { name: true, code: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const openBills = bills.filter((b) => b.status === 'OPEN');
    const submittedBills = bills.filter((b) => b.status === 'SUBMITTED');
    const totalRevenue = submittedBills.reduce((s, b) => s + Number(b.total), 0);
    const openRevenue = openBills.reduce((s, b) => s + Number(b.total), 0);
    const totalItems = submittedBills.reduce((s, b) => s + b.items.reduce((si, i) => si + i.quantity, 0), 0);

    res.json({
      totalBills: bills.length,
      openBills: openBills.length,
      submittedBills: submittedBills.length,
      totalRevenue,
      openRevenue,
      totalItems,
      bills,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /bills — create new bill
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { branchId, items, notes, discount = 0 } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' });
    }
    const targetBranch = branchId || req.user!.branchId;
    if (!targetBranch) {
      return res.status(400).json({ error: 'กรุณาระบุสาขา' });
    }

    let subtotal = 0;
    const billItems = (items as any[]).map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      const itemDiscount = Number(it.discount) || 0;
      const sub = price * qty - itemDiscount;
      subtotal += sub;
      return { itemId: it.itemId, quantity: qty, price, discount: itemDiscount, subtotal: sub };
    });

    const totalDiscount = Math.max(0, Number(discount));
    const total = Math.max(0, subtotal - totalDiscount);

    const bill = await prisma.bill.create({
      data: {
        billNumber: generateBillNumber(),
        branchId: targetBranch,
        userId: req.user!.id,
        subtotal,
        discount: totalDiscount,
        total,
        notes,
        items: { create: billItems },
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
        items: { include: { item: true } },
      },
    });
    logAudit({ userId: req.user!.id, action: 'CREATE_BILL', entity: 'Bill', entityId: bill.id, detail: { billNumber: bill.billNumber, subtotal, discount: totalDiscount, total, itemCount: billItems.length, branchId: targetBranch }, ip: getClientIp(req) });
    res.status(201).json(bill);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /bills/:id — edit an OPEN bill (or SUBMITTED if SUPER_ADMIN)
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { item: { select: { id: true, name: true, sku: true, barcode: true } } } } },
    });
    if (!bill) return res.status(404).json({ error: 'ไม่พบบิล' });

    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    // SUPER_ADMIN can edit OPEN or SUBMITTED; others can only edit OPEN
    if (!isSuperAdmin && bill.status !== 'OPEN') {
      return res.status(400).json({ error: 'แก้ไขได้เฉพาะบิลที่ยังเปิดอยู่เท่านั้น' });
    }
    if (bill.status === 'CANCELLED') {
      return res.status(400).json({ error: 'ไม่สามารถแก้ไขบิลที่ยกเลิกแล้ว' });
    }

    // Ownership / scope checks
    if (req.user!.role === 'CASHIER' && bill.userId !== req.user!.id) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขบิลนี้' });
    }
    if (req.user!.role === 'BRANCH_ADMIN' && bill.branchId !== req.user!.branchId) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขบิลสาขาอื่น' });
    }

    const { items, notes, discount = 0 } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' });
    }

    let subtotal = 0;
    const billItems = (items as any[]).map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.price) || 0;
      const itemDiscount = Number(it.discount) || 0;
      const sub = price * qty - itemDiscount;
      subtotal += sub;
      return { itemId: it.itemId, quantity: qty, price, discount: itemDiscount, subtotal: sub };
    });
    const totalDiscount = Math.max(0, Number(discount));
    const total = Math.max(0, subtotal - totalDiscount);

    // Atomic: delete old items and recreate within one transaction to prevent data loss
    const updated = await prisma.$transaction(async (tx) => {
      await tx.billItem.deleteMany({ where: { billId: bill.id } });
      return tx.bill.update({
        where: { id: req.params.id },
        data: {
          subtotal,
          discount: totalDiscount,
          total,
          notes,
          items: { create: billItems },
        },
        include: {
          branch: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true } },
          items: { include: { item: { select: { id: true, name: true, sku: true, barcode: true, imageUrl: true } } } },
        },
      });
    });
    const beforeSnapshot = {
      status: bill.status,
      subtotal: Number(bill.subtotal),
      discount: Number(bill.discount),
      total: Number(bill.total),
      notes: bill.notes,
      items: (bill as any).items.map((bi: any) => ({
        name: bi.item?.name ?? '',
        sku: bi.item?.sku ?? '',
        barcode: bi.item?.barcode ?? '',
        quantity: bi.quantity,
        price: Number(bi.price),
        discount: Number(bi.discount),
        subtotal: Number(bi.subtotal),
      })),
    };
    const afterSnapshot = {
      status: bill.status,
      subtotal,
      discount: totalDiscount,
      total,
      notes,
      items: await Promise.all(billItems.map(async (bi) => {
        const item = await prisma.item.findUnique({ where: { id: bi.itemId }, select: { name: true, sku: true, barcode: true } });
        return { name: item?.name ?? '', sku: item?.sku ?? '', barcode: item?.barcode ?? '', quantity: bi.quantity, price: Number(bi.price), discount: Number(bi.discount), subtotal: Number(bi.subtotal) };
      })),
    };
    logAudit({ userId: req.user!.id, action: 'EDIT_BILL', entity: 'Bill', entityId: bill.id, detail: { billNumber: bill.billNumber, before: beforeSnapshot, after: afterSnapshot }, ip: getClientIp(req) });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /bills/submit-day — submit (close) all open bills for today
router.post('/submit-day', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { branchId } = req.body;
    const { today, tomorrow } = getTodayRange();

    const where: any = {
      status: 'OPEN',
      createdAt: { gte: today, lt: tomorrow },
    };

    if (req.user!.role === 'CASHIER') {
      // Cashier: only their own bills
      where.userId = req.user!.id;
    } else if (req.user!.role === 'BRANCH_ADMIN') {
      // Branch admin: always scoped to their own branch
      where.branchId = req.user!.branchId;
    } else {
      // SUPER_ADMIN: must explicitly provide branchId — prevents closing ALL branches at once
      if (!branchId) {
        return res.status(400).json({ error: 'กรุณาระบุสาขาที่ต้องการปิดวัน' });
      }
      where.branchId = branchId;
    }

    const result = await prisma.bill.updateMany({
      where,
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    logAudit({ userId: req.user!.id, action: 'SUBMIT_DAY', entity: 'Bill', detail: { count: result.count, branchId: where.branchId }, ip: getClientIp(req) });
    res.json({ message: `ส่งบิล ${result.count} รายการเรียบร้อย`, count: result.count });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /bills/:id/cancel
router.put('/:id/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) return res.status(404).json({ error: 'ไม่พบบิล' });
    if (bill.status !== 'OPEN') return res.status(400).json({ error: 'ยกเลิกได้เฉพาะบิลที่ยังเปิดอยู่' });

    // Ownership / scope checks
    if (req.user!.role === 'CASHIER' && bill.userId !== req.user!.id) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกบิลนี้' });
    }
    if (req.user!.role === 'BRANCH_ADMIN' && bill.branchId !== req.user!.branchId) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกบิลสาขาอื่น' });
    }

    const updated = await prisma.bill.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    logAudit({ userId: req.user!.id, action: 'CANCEL_BILL', entity: 'Bill', entityId: bill.id, detail: { billNumber: bill.billNumber, total: Number(bill.total), status: bill.status }, ip: getClientIp(req) });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
