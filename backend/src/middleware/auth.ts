import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: { id: string; role: string; branchId?: string | null };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
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
