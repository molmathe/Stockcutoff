import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

const safeUser = (u: any) => {
  const { password: _p, ...rest } = u;
  return rest;
};

router.get('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where: any = {};
    if (req.user!.role === 'BRANCH_ADMIN') where.branchId = req.user!.branchId;
    const users = await prisma.user.findMany({
      where,
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users.map(safeUser));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, name, role, branchId } = req.body;
    if (req.user!.role === 'BRANCH_ADMIN' && role !== 'CASHIER') {
      return res.status(403).json({ error: 'Branch admin can only create cashier accounts' });
    }
    const user = await prisma.user.create({
      data: {
        username,
        password: await bcrypt.hash(password, 10),
        name,
        role,
        branchId: req.user!.role === 'BRANCH_ADMIN' ? req.user!.branchId! : branchId || null,
      },
      include: { branch: true },
    });
    res.status(201).json(safeUser(user));
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, role, branchId, active, password } = req.body;
    const data: any = { name, active };
    if (req.user!.role === 'SUPER_ADMIN') {
      data.role = role;
      data.branchId = branchId || null;
    }
    if (password) data.password = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({ where: { id: req.params.id }, data, include: { branch: true } });
    res.json(safeUser(user));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.id === req.user!.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
