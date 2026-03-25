import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import itemRoutes from './routes/items';
import branchRoutes from './routes/branches';
import billRoutes from './routes/bills';
import userRoutes from './routes/users';
import reportRoutes from './routes/reports';
import categoryRoutes from './routes/categories';
import auditLogRoutes from './routes/auditLogs';
import deptReconcileRoutes from './routes/deptReconcile';
import prisma from './lib/prisma';
// Removed reportTemplateRoutes

dotenv.config();

// ── Startup validation ──────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is too short. Use at least 32 random characters.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Trust nginx reverse proxy (required for express-rate-limit behind nginx)
app.set('trust proxy', 1);

// ── Rate limiters ────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Request rate limit exceeded' },
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/pos-login', loginLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/dept-reconcile', deptReconcileRoutes);
// Removed /api/report-templates route

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

// ── Audit log retention cleanup (keep 1000 days) ─────────────────────────────
const cleanAuditLogs = async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1000);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (result.count > 0) console.log(`[audit] Cleaned ${result.count} log(s) older than 1000 days`);
};
cleanAuditLogs().catch(console.error);
setInterval(() => cleanAuditLogs().catch(console.error), 24 * 60 * 60 * 1000);

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
