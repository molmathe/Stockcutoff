import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';

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
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบ (username, password, name)' });
    }
    if (req.user!.role === 'BRANCH_ADMIN' && role !== 'CASHIER') {
      return res.status(403).json({ error: 'Branch admin สามารถสร้างได้เฉพาะ CASHIER เท่านั้น' });
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

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_USER',
      entity: 'User',
      entityId: user.id,
      ip: getClientIp(req),
      detail: { username: user.username, name: user.name, role: user.role }
    });

    res.status(201).json(safeUser(user));
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    // Load target user to enforce scope and privilege checks
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });

    if (req.user!.role === 'BRANCH_ADMIN') {
      // Branch admin: can only manage cashiers in their own branch
      if (target.branchId !== req.user!.branchId) {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขผู้ใช้สาขาอื่น' });
      }
      if (target.role !== 'CASHIER') {
        return res.status(403).json({ error: 'ไม่มีสิทธิ์แก้ไขผู้ดูแลระบบ' });
      }
    }

    const { name, role, branchId, active, password } = req.body;
    const data: any = { name, active };

    if (req.user!.role === 'SUPER_ADMIN') {
      data.role = role;
      data.branchId = branchId || null;
    }

    // Password change: only allowed by SUPER_ADMIN, or BRANCH_ADMIN updating own-branch cashier
    const passwordChanged = !!password;
    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data, include: { branch: true } });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_USER',
      entity: 'User',
      entityId: user.id,
      ip: getClientIp(req),
      detail: { username: user.username, name: user.name, role: user.role, passwordChanged }
    });

    res.json(safeUser(user));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.id === req.user!.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    if (target.isSystem) return res.status(400).json({ error: 'ไม่สามารถลบ system user ได้' });
    await prisma.user.delete({ where: { id: req.params.id } });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_USER',
      entity: 'User',
      entityId: target.id,
      ip: getClientIp(req),
      detail: { username: target.username, name: target.name, role: target.role }
    });

    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
