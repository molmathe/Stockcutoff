import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

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
    const cat = await prisma.category.create({ data: { name: name.trim() } });
    res.status(201).json(cat);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'ชื่อหมวดหมู่นี้มีอยู่แล้ว' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    const oldCat = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!oldCat) return res.status(404).json({ error: 'ไม่พบหมวดหมู่' });
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: { name: name.trim() } });
    // Sync items that used old name
    await prisma.item.updateMany({ where: { category: oldCat.name }, data: { category: cat.name } });
    res.json(cat);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'ชื่อหมวดหมู่นี้มีอยู่แล้ว' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    const cats = await prisma.category.findMany({ where: { id: { in: ids } }, select: { name: true } });
    const names = cats.map((c) => c.name);
    await prisma.item.updateMany({ where: { category: { in: names } }, data: { category: null } });
    await prisma.category.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `ลบ ${ids.length} หมวดหมู่` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const cat = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!cat) return res.status(404).json({ error: 'ไม่พบหมวดหมู่' });
    await prisma.item.updateMany({ where: { category: cat.name }, data: { category: null } });
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ message: 'ลบเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
