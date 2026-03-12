import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (_req, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
    res.json(branches);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone } = req.body;
    const branch = await prisma.branch.create({ data: { name, code, address, phone } });
    res.status(201).json(branch);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Branch code already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone, active } = req.body;
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { name, code, address, phone, active },
    });
    res.json(branch);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Branch code already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    await prisma.branch.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `${ids.length} branches deleted` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (_req, res: Response) => {
  try {
    await prisma.branch.delete({ where: { id: _req.params.id } });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
