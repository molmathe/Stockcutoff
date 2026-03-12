import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const generateBillNumber = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `B${date}-${uuidv4().split('-')[0].toUpperCase()}`;
};

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
    });
    res.json(bills);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { branchId, items, notes, discount = 0 } = req.body;

    let subtotal = 0;
    const billItems = (items as any[]).map((it) => {
      const sub = it.price * it.quantity - (it.discount || 0);
      subtotal += sub;
      return { itemId: it.itemId, quantity: it.quantity, price: it.price, discount: it.discount || 0, subtotal: sub };
    });

    const totalDiscount = Number(discount);
    const total = subtotal - totalDiscount;

    const bill = await prisma.bill.create({
      data: {
        billNumber: generateBillNumber(),
        branchId: branchId || req.user!.branchId!,
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
    res.status(201).json(bill);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/submit-day', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { branchId } = req.body;
    const targetBranch = branchId || req.user!.branchId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where: any = {
      status: 'OPEN',
      createdAt: { gte: today, lt: tomorrow },
    };
    if (targetBranch) where.branchId = targetBranch;
    if (req.user!.role === 'CASHIER') where.userId = req.user!.id;

    const result = await prisma.bill.updateMany({
      where,
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    res.json({ message: `${result.count} bills submitted`, count: result.count });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (bill.status !== 'OPEN') return res.status(400).json({ error: 'Can only cancel open bills' });
    const updated = await prisma.bill.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
