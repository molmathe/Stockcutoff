import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username }, include: { branch: true } });

    if (!user || !user.active || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, branchId: user.branchId },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branchId, branch: user.branch },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { branch: true } });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branchId, branch: user.branch });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
