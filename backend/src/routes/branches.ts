import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (_req, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
    // Never expose pincode to frontend list
    res.json(branches.map(({ pincode: _p, ...b }) => b));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single branch (admin only) — includes pincode masked
router.get('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
    if (!branch) return res.status(404).json({ error: 'ไม่พบสาขา' });
    // Return pincode presence but not value
    res.json({ ...branch, hasPincode: !!branch.pincode, pincode: undefined });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone, pincode } = req.body;
    const data: any = { name, code, address, phone };
    if (pincode && pincode.trim()) {
      if (!/^\d{4,6}$/.test(pincode.trim())) {
        return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
      }
      data.pincode = pincode.trim();
    }
    const branch = await prisma.branch.create({ data });
    res.status(201).json({ ...branch, pincode: undefined, hasPincode: !!branch.pincode });
  } catch (err: any) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('pincode') ? 'รหัส PIN' : 'รหัสสาขา';
      return res.status(400).json({ error: `${field}นี้มีอยู่แล้ว` });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone, active, pincode } = req.body;
    const data: any = { name, code, address, phone, active };

    if (pincode !== undefined) {
      if (pincode === '' || pincode === null) {
        data.pincode = null; // Remove pincode
      } else if (/^\d{4,6}$/.test(String(pincode).trim())) {
        data.pincode = String(pincode).trim();
      } else {
        return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' });
      }
    }

    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ ...branch, pincode: undefined, hasPincode: !!branch.pincode });
  } catch (err: any) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('pincode') ? 'รหัส PIN' : 'รหัสสาขา';
      return res.status(400).json({ error: `${field}นี้มีอยู่แล้ว` });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    await prisma.branch.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `ลบ ${ids.length} สาขาเรียบร้อย` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (_req, res: Response) => {
  try {
    await prisma.branch.delete({ where: { id: _req.params.id } });
    res.json({ message: 'ลบเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
