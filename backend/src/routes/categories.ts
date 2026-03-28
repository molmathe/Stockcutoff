import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';

const router = Router();

router.get('/', authenticate, async (_req, res: Response) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json(cats);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหมวดหมู่' });
    const cat = await prisma.category.create({ data: { name: name.trim() } });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_CATEGORY',
      entity: 'Category',
      entityId: cat.id,
      ip: getClientIp(req),
      detail: { name: cat.name }
    });

    res.status(201).json(cat);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'ชื่อหมวดหมู่นี้มีอยู่แล้ว' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหมวดหมู่' });

    const oldCat = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!oldCat) return res.status(404).json({ error: 'ไม่พบหมวดหมู่' });

    // Atomic: rename category and sync all items in one transaction
    const [cat] = await prisma.$transaction([
      prisma.category.update({ where: { id: req.params.id }, data: { name: name.trim() } }),
      prisma.item.updateMany({ where: { category: oldCat.name }, data: { category: name.trim() } }),
    ]);

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_CATEGORY',
      entity: 'Category',
      entityId: cat.id,
      ip: getClientIp(req),
      detail: { before: oldCat.name, after: cat.name }
    });

    res.json(cat);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'ชื่อหมวดหมู่นี้มีอยู่แล้ว' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'กรุณาระบุรายการที่ต้องการลบ' });
    }
    const cats = await prisma.category.findMany({ where: { id: { in: ids } }, select: { name: true } });
    const names = cats.map((c) => c.name);
    await prisma.$transaction([
      prisma.item.updateMany({ where: { category: { in: names } }, data: { category: null } }),
      prisma.category.deleteMany({ where: { id: { in: ids } } }),
    ]);
    res.json({ message: `ลบ ${ids.length} หมวดหมู่` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!cat) return res.status(404).json({ error: 'ไม่พบหมวดหมู่' });
    await prisma.$transaction([
      prisma.item.updateMany({ where: { category: cat.name }, data: { category: null } }),
      prisma.category.delete({ where: { id: req.params.id } }),
    ]);

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_CATEGORY',
      entity: 'Category',
      entityId: cat.id,
      ip: getClientIp(req),
      detail: { name: cat.name }
    });

    res.json({ message: 'ลบเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
