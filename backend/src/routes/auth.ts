import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest, getSecret } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';

const router = Router();

// Standard admin/cashier login (username + password)
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน' });
    }
    const user = await prisma.user.findUnique({ where: { username }, include: { branch: true } });

    if (!user || !user.active || !(await bcrypt.compare(password, user.password))) {
      await logAudit({ userId: 'UNKNOWN', action: 'LOGIN_FAILED', entity: 'User', detail: { username }, ip: getClientIp(req) });
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, branchId: user.branchId },
      getSecret(),
      { expiresIn: '1h' }
    );

    // Audit log successful login
    await logAudit({ userId: user.id, action: 'LOGIN_SUCCESS', entity: 'User', ip: getClientIp(req) });

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
    if (!branch || !branch.active) {
      await logAudit({ userId: 'UNKNOWN', action: 'POS_LOGIN_FAILED', entity: 'Branch', detail: { pincode }, ip: getClientIp(req) });
      return res.status(401).json({ error: 'รหัส PIN ไม่ถูกต้อง' });
    }

    // Upsert system POS user — atomic, avoids race condition on concurrent logins
    const posUsername = `pos_${branch.code.toLowerCase()}`;
    const posUser = await prisma.user.upsert({
      where: { username: posUsername },
      update: { branchId: branch.id, active: true },
      create: {
        username: posUsername,
        password: await bcrypt.hash(posUsername, 10), // password unused; PIN is the auth mechanism
        name: `POS ${branch.name}`,
        role: 'CASHIER',
        branchId: branch.id,
        isSystem: true,
        active: true,
      },
    });

    const token = jwt.sign(
      { id: posUser.id, role: 'CASHIER', branchId: branch.id, posMode: true },
      getSecret(),
      { expiresIn: '8h' }
    );

    // Audit log POS login
    await logAudit({
      userId: posUser.id,
      action: 'POS_LOGIN_SUCCESS',
      entity: 'Branch',
      entityId: branch.id,
      ip: getClientIp(req),
      detail: { branch: branch.name }
    });

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
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role, branchId: user.branchId, branch: user.branch, ...(user.isSystem ? { posMode: true } : {}) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
