import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';

// Slip image upload — stored in /uploads/ alongside item images
const slipUploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(slipUploadDir)) fs.mkdirSync(slipUploadDir, { recursive: true });
const slipUpload = multer({
  storage: multer.diskStorage({
    destination: slipUploadDir,
    filename: (_req, file, cb) => {
      const unique = `slip-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  fileFilter: (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (/jpeg|jpg|png|gif|webp/.test(path.extname(file.originalname).toLowerCase()) && /image/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB for slip photos
});

const router = Router();

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Distributes a global discount amount pro-rata across line items.
 * Each item receives: (itemSubtotal / totalSubtotal) * globalDiscountAmt
 * Rounding remainders ("penny rule") are applied to the largest line item.
 *
 * @param lineSubtotals - net subtotal for each line AFTER manual item discounts
 * @param globalDiscountAmt - total bill-level discount to distribute
 * @returns allocated globalDiscount per line index
 */
function distributeGlobalDiscount(lineSubtotals: number[], globalDiscountAmt: number): number[] {
  if (globalDiscountAmt <= 0 || lineSubtotals.length === 0) {
    return lineSubtotals.map(() => 0);
  }
  const total = lineSubtotals.reduce((s, v) => s + v, 0);
  if (total <= 0) return lineSubtotals.map(() => 0);

  const allocated = lineSubtotals.map((sub) => round2((sub / total) * globalDiscountAmt));
  const allocatedSum = round2(allocated.reduce((s, v) => s + v, 0));
  const remainder = round2(globalDiscountAmt - allocatedSum);

  // Penny rule: apply rounding difference to the largest line item
  if (remainder !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < lineSubtotals.length; i++) {
      if (lineSubtotals[i] > lineSubtotals[maxIdx]) maxIdx = i;
    }
    allocated[maxIdx] = round2(allocated[maxIdx] + remainder);
  }

  return allocated;
}

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

    const [bills, totalCount] = await Promise.all([
      prisma.bill.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true } },
          items: { include: { item: { select: { id: true, name: true, sku: true, barcode: true, imageUrl: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500, // safety cap to prevent OOM on large datasets
      }),
      prisma.bill.count({ where }),
    ]);
    const truncated = totalCount > 500;
    res.json({ bills, truncated, totalCount });
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
    const { branchId, items, notes, discount = 0, discountPct = 0, paymentMethod = 'CASH' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' });
    }
    const targetBranch = branchId || req.user!.branchId;
    if (!targetBranch) {
      return res.status(400).json({ error: 'กรุณาระบุสาขา' });
    }

    let subtotal = 0;
    const rawItems = (items as any[]).map((it, idx) => {
      const qty = Number(it.quantity);
      const price = Number(it.price);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
        throw Object.assign(new Error(`รายการที่ ${idx + 1}: จำนวนต้องเป็นจำนวนเต็มบวก`), { status: 400 });
      }
      if (!Number.isFinite(price) || price < 0) {
        throw Object.assign(new Error(`รายการที่ ${idx + 1}: ราคาไม่ถูกต้อง`), { status: 400 });
      }
      const itemDiscount = Math.min(Math.max(0, round2(Number(it.discount) || 0)), round2(price * qty));
      const sub = round2(price * qty - itemDiscount); // subtotal after manual discount, before global
      subtotal = round2(subtotal + sub);
      return { itemId: it.itemId, quantity: qty, price, discount: itemDiscount, sub };
    });

    const totalDiscountPct = Math.min(99, Math.max(0, round2(Number(discountPct))));
    // Global discount: prefer discountPct (percentage-based); fall back to fixed amount
    const globalDiscountAmt = totalDiscountPct > 0
      ? round2(subtotal * totalDiscountPct / 100)
      : Math.max(0, round2(Number(discount)));
    const totalDiscount = globalDiscountAmt;

    // Pro-rata distribution of global discount across line items
    const lineSubtotals = rawItems.map((it) => it.sub);
    const globalAllocations = distributeGlobalDiscount(lineSubtotals, globalDiscountAmt);

    const billItems = rawItems.map((it, i) => {
      const globalDiscount = globalAllocations[i];
      const netSubtotal = round2(it.sub - globalDiscount);
      return { itemId: it.itemId, quantity: it.quantity, price: it.price, discount: it.discount, globalDiscount, subtotal: netSubtotal };
    });

    const total = Math.max(0, round2(subtotal - totalDiscount));

    const validPaymentMethod = paymentMethod === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH';
    const bill = await prisma.bill.create({
      data: {
        billNumber: generateBillNumber(),
        branchId: targetBranch,
        userId: req.user!.id,
        subtotal,
        discount: totalDiscount,
        discountPct: totalDiscountPct,
        total,
        notes,
        paymentMethod: validPaymentMethod,
        items: { create: billItems },
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
        items: { include: { item: true } },
      },
    });
    await logAudit({ userId: req.user!.id, action: 'CREATE_BILL', entity: 'Bill', entityId: bill.id, detail: { billNumber: bill.billNumber, subtotal, discount: totalDiscount, total, itemCount: billItems.length, branchId: targetBranch }, ip: getClientIp(req) });
    res.status(201).json(bill);
  } catch (err: any) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
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

    const { items, notes, discount = 0, discountPct = 0, paymentMethod } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' });
    }

    let subtotal = 0;
    const rawItems = (items as any[]).map((it, idx) => {
      const qty = Number(it.quantity);
      const price = Number(it.price);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
        throw Object.assign(new Error(`รายการที่ ${idx + 1}: จำนวนต้องเป็นจำนวนเต็มบวก`), { status: 400 });
      }
      if (!Number.isFinite(price) || price < 0) {
        throw Object.assign(new Error(`รายการที่ ${idx + 1}: ราคาไม่ถูกต้อง`), { status: 400 });
      }
      const itemDiscount = Math.min(Math.max(0, round2(Number(it.discount) || 0)), round2(price * qty));
      const sub = round2(price * qty - itemDiscount); // after manual discount, before global
      subtotal = round2(subtotal + sub);
      return { itemId: it.itemId, quantity: qty, price, discount: itemDiscount, sub };
    });
    const totalDiscountPct = Math.min(99, Math.max(0, round2(Number(discountPct))));
    const globalDiscountAmt = totalDiscountPct > 0
      ? round2(subtotal * totalDiscountPct / 100)
      : Math.max(0, round2(Number(discount)));
    const totalDiscount = globalDiscountAmt;

    // Pro-rata distribution of global discount across line items
    const lineSubtotals = rawItems.map((it) => it.sub);
    const globalAllocations = distributeGlobalDiscount(lineSubtotals, globalDiscountAmt);

    const billItems = rawItems.map((it, i) => {
      const globalDiscount = globalAllocations[i];
      const netSubtotal = round2(it.sub - globalDiscount);
      return { itemId: it.itemId, quantity: it.quantity, price: it.price, discount: it.discount, globalDiscount, subtotal: netSubtotal };
    });
    const total = Math.max(0, round2(subtotal - totalDiscount));

    const updateData: any = {
      subtotal,
      discount: totalDiscount,
      discountPct: totalDiscountPct,
      total,
      notes,
      items: { create: billItems },
    };
    if (paymentMethod === 'CASH' || paymentMethod === 'BANK_TRANSFER') {
      updateData.paymentMethod = paymentMethod;
    }

    // Atomic: delete old items and recreate within one transaction to prevent data loss
    const updated = await prisma.$transaction(async (tx) => {
      await tx.billItem.deleteMany({ where: { billId: bill.id } });
      return tx.bill.update({
        where: { id: req.params.id },
        data: updateData,
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
        globalDiscount: Number(bi.globalDiscount ?? 0),
        subtotal: Number(bi.subtotal),
      })),
    };
    // afterSnapshot uses data already fetched inside the transaction — no extra queries
    const afterSnapshot = {
      status: bill.status,
      subtotal,
      discount: totalDiscount,
      total,
      notes,
      items: updated.items.map((bi: any) => ({
        name: bi.item?.name ?? '',
        sku: bi.item?.sku ?? '',
        barcode: bi.item?.barcode ?? '',
        quantity: bi.quantity,
        price: Number(bi.price),
        discount: Number(bi.discount),
        globalDiscount: Number(bi.globalDiscount ?? 0),
        subtotal: Number(bi.subtotal),
      })),
    };
    await logAudit({ userId: req.user!.id, action: 'EDIT_BILL', entity: 'Bill', entityId: bill.id, detail: { billNumber: bill.billNumber, before: beforeSnapshot, after: afterSnapshot }, ip: getClientIp(req) });
    res.json(updated);
  } catch (err: any) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /bills/:id/submit — submit (close) a single OPEN bill
router.post('/:id/submit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) return res.status(404).json({ error: 'ไม่พบบิล' });
    if (bill.status !== 'OPEN') return res.status(400).json({ error: 'ปิดได้เฉพาะบิลที่ยังเปิดอยู่เท่านั้น' });

    // CASHIER and BRANCH_ADMIN can only close bills of their own branch
    if (req.user!.role !== 'SUPER_ADMIN' && bill.branchId !== req.user!.branchId) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ปิดบิลของสาขาอื่น' });
    }

    const updated = await prisma.bill.update({
      where: { id: bill.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });

    logAudit({ userId: req.user!.id, action: 'SUBMIT_DAY', entity: 'Bill', entityId: bill.id, detail: { billNumber: bill.billNumber, single: true }, ip: getClientIp(req) });
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

// PUT /bills/:id/cancel — soft-delete (set CANCELLED); SUPER_ADMIN can void SUBMITTED too
router.put('/:id/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) return res.status(404).json({ error: 'ไม่พบบิล' });
    if (bill.status === 'CANCELLED') return res.status(400).json({ error: 'บิลนี้ถูกยกเลิกแล้ว' });

    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    // Only SUPER_ADMIN can void SUBMITTED bills; others can only void OPEN bills
    if (!isSuperAdmin && bill.status !== 'OPEN') {
      return res.status(403).json({ error: 'ยกเลิกได้เฉพาะบิลที่ยังเปิดอยู่ (SUPER_ADMIN เท่านั้นที่ยกเลิกบิลที่ส่งแล้วได้)' });
    }

    // Ownership / scope checks
    if (req.user!.role === 'CASHIER' && bill.userId !== req.user!.id) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกบิลนี้' });
    }
    if (req.user!.role === 'BRANCH_ADMIN' && bill.branchId !== req.user!.branchId) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ยกเลิกบิลสาขาอื่น' });
    }

    const updated = await prisma.bill.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
    await logAudit({ userId: req.user!.id, action: 'CANCEL_BILL', entity: 'Bill', entityId: bill.id, detail: { billNumber: bill.billNumber, total: Number(bill.total), previousStatus: bill.status }, ip: getClientIp(req) });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /bills/:id/slip — upload payment slip image (replaces existing slip)
router.post('/:id/slip', authenticate, slipUpload.single('slip'), async (req: AuthRequest, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) return res.status(404).json({ error: 'ไม่พบบิล' });

    // Permission: cashier only their own bills, branch_admin their branch
    if (req.user!.role === 'CASHIER' && bill.userId !== req.user!.id) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์อัพโหลดสลิปบิลนี้' });
    }
    if (req.user!.role === 'BRANCH_ADMIN' && bill.branchId !== req.user!.branchId) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์อัพโหลดสลิปบิลสาขาอื่น' });
    }

    if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพ' });

    // Remove old slip file from disk if it exists
    if (bill.slipUrl) {
      const oldPath = path.join(__dirname, '../..', bill.slipUrl);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const slipUrl = `/uploads/${req.file.filename}`;
    const updated = await prisma.bill.update({
      where: { id: req.params.id },
      data: { slipUrl },
    });
    res.json({ slipUrl: updated.slipUrl });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /bills/:id/slip — remove slip image from a bill
router.delete('/:id/slip', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const bill = await prisma.bill.findUnique({ where: { id: req.params.id } });
    if (!bill) return res.status(404).json({ error: 'ไม่พบบิล' });

    if (req.user!.role === 'CASHIER' && bill.userId !== req.user!.id) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    }
    if (req.user!.role === 'BRANCH_ADMIN' && bill.branchId !== req.user!.branchId) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์' });
    }

    if (bill.slipUrl) {
      const filePath = path.join(__dirname, '../..', bill.slipUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.bill.update({ where: { id: req.params.id }, data: { slipUrl: null } });
    res.json({ message: 'ลบสลิปเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /bills/:id — hard delete a SUBMITTED or CANCELLED bill (SUPER_ADMIN only)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'เฉพาะ SUPER_ADMIN เท่านั้นที่ลบบิลได้' });
    }

    const bill = await prisma.bill.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!bill) return res.status(404).json({ error: 'ไม่พบบิล' });
    if (bill.status !== 'SUBMITTED' && bill.status !== 'CANCELLED') {
      return res.status(400).json({ error: 'ลบได้เฉพาะบิลที่ส่งแล้ว (SUBMITTED) หรือยกเลิก (CANCELLED) เท่านั้น' });
    }

    // Remove slip image from disk if exists
    if (bill.slipUrl) {
      const slipPath = path.join(__dirname, '../..', bill.slipUrl);
      if (fs.existsSync(slipPath)) fs.unlinkSync(slipPath);
    }

    await prisma.bill.delete({ where: { id: req.params.id } });
    logAudit({
      userId: req.user!.id,
      action: 'DELETE_BILL',
      entity: 'Bill',
      entityId: bill.id,
      detail: { billNumber: bill.billNumber, total: Number(bill.total), itemCount: bill.items.length },
      ip: getClientIp(req),
    });
    res.json({ message: `ลบบิล ${bill.billNumber} เรียบร้อยแล้ว` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
