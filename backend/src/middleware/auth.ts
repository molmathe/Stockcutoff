import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: { id: string; role: string; branchId?: string | null };
}

// JWT_SECRET is validated at startup in index.ts — safe to use non-null assertion here
const getSecret = (): string => process.env.JWT_SECRET!;

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let payload: { id?: string };
  try {
    payload = jwt.verify(token, getSecret()) as { id?: string };
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!payload?.id) return res.status(401).json({ error: 'Invalid token' });

  try {
    // Re-read the account on every request rather than trusting the token body.
    // Tokens live for 1h (8h for POS), so deactivating or deleting a user used to
    // leave them working for that long, and a role or branch change did not take
    // effect until the old token expired.
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, branchId: true, active: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = { id: user.id, role: user.role, branchId: user.branchId };
    next();
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !['SUPER_ADMIN', 'BRANCH_ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

export const requireSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

export { getSecret };
