import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

const safeBranch = (b: any) => {
  const { pincode, ...rest } = b;
  return { ...rest, hasPincode: !!pincode };
};

// GET all branches
router.get('/', authenticate, async (_req, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
    res.json(branches.map(safeBranch));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single branch
router.get('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
    if (!branch) return res.status(404).json({ error: 'ไม่พบสาขา' });
    res.json(safeBranch(branch));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone, pincode, type, reportBranchId, bigsellerBranchId } = req.body;
    const data: any = { name, code, address, phone };

    if (type) data.type = type;
    if (reportBranchId !== undefined) data.reportBranchId = reportBranchId || null;
    if (bigsellerBranchId !== undefined) data.bigsellerBranchId = bigsellerBranchId || null;

    if (pincode && String(pincode).trim()) {
      if (!/^\d{4,6}$/.test(String(pincode).trim())) {
        return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
      }
      data.pincode = String(pincode).trim();
    }
    const branch = await prisma.branch.create({ data });
    res.status(201).json(safeBranch(branch));
  } catch (err: any) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('pincode') ? 'รหัส PIN' : 'รหัสสาขา';
      return res.status(400).json({ error: `${field}นี้มีอยู่แล้ว` });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone, active, pincode, type, reportBranchId, bigsellerBranchId } = req.body;
    const data: any = { name, code, address, phone, active };

    if (type !== undefined) data.type = type;
    if (reportBranchId !== undefined) data.reportBranchId = reportBranchId || null;
    if (bigsellerBranchId !== undefined) data.bigsellerBranchId = bigsellerBranchId || null;

    if (pincode !== undefined) {
      if (pincode === '' || pincode === null) {
        data.pincode = null;
      } else if (/^\d{4,6}$/.test(String(pincode).trim())) {
        data.pincode = String(pincode).trim();
      } else {
        return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
      }
    }

    const branch = await prisma.branch.update({ where: { id: req.params.id }, data });
    res.json(safeBranch(branch));
  } catch (err: any) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('pincode') ? 'รหัส PIN' : 'รหัสสาขา';
      return res.status(400).json({ error: `${field}นี้มีอยู่แล้ว` });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE bulk
router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    await prisma.branch.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `ลบ ${ids.length} สาขาเรียบร้อย` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE single
router.delete('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    await prisma.branch.delete({ where: { id: req.params.id } });
    res.json({ message: 'ลบเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
