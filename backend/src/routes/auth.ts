import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Standard admin/cashier login (username + password)
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username }, include: { branch: true } });

    if (!user || !user.active || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
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

// POS login via branch pincode — returns a session for the branch's system POS user
router.post('/pos-login', async (req: Request, res: Response) => {
  try {
    const { pincode } = req.body;
    if (!pincode) return res.status(400).json({ error: 'กรุณาระบุรหัส PIN' });

    const branch = await prisma.branch.findUnique({ where: { pincode: String(pincode) } });
    if (!branch || !branch.active) return res.status(401).json({ error: 'รหัส PIN ไม่ถูกต้อง' });

    // Find or create a system POS user for this branch
    const posUsername = `pos_${branch.code.toLowerCase()}`;
    let posUser = await prisma.user.findUnique({ where: { username: posUsername } });

    if (!posUser) {
      posUser = await prisma.user.create({
        data: {
          username: posUsername,
          password: await bcrypt.hash(pincode, 10),
          name: `POS ${branch.name}`,
          role: 'CASHIER',
          branchId: branch.id,
          isSystem: true,
          active: true,
        },
      });
    }

    // Update POS user branch if it changed
    if (posUser.branchId !== branch.id) {
      posUser = await prisma.user.update({ where: { id: posUser.id }, data: { branchId: branch.id } });
    }

    const token = jwt.sign(
      { id: posUser.id, role: 'CASHIER', branchId: branch.id, posMode: true },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: posUser.id,
        username: posUser.username,
        name: posUser.name,
        role: posUser.role,
        branchId: branch.id,
        branch: { id: branch.id, name: branch.name, code: branch.code },
        posMode: true,
      },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { branch: true } });
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branchId, branch: user.branch });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
