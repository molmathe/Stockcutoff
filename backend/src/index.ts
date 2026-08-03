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
import blockedBarcodesRoutes from './routes/blockedBarcodes';
import databaseRoutes from './routes/database';
import calendarRoutes from './routes/calendar';
import branchKpiRoutes from './routes/branchKpi';
import notificationsRoutes from './routes/notifications';
import prisma from './lib/prisma';
import { clientIp } from './lib/clientIp';
// Removed reportTemplateRoutes

dotenv.config();

// ── Startup validation ──────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 64) {
  console.error('FATAL: JWT_SECRET is too short. Use at least 64 random characters.');
  process.exit(1);
}
if (!process.env.FRONTEND_URL) {
  console.error('FATAL: FRONTEND_URL environment variable is not set. Refusing to start.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;

// Two proxies sit in front of this service: the cloudflared tunnel container and
// nginx. At 1 this resolved req.ip to the tunnel's own address, so every caller in
// the world shared one rate-limit bucket — confirmed against production by watching
// RateLimit-Remaining fall for requests made from unrelated source IPs.
//
// Counting from the right is what makes the result unspoofable: Cloudflare appends
// the true client address to X-Forwarded-For, so extra entries a caller injects sit
// further left and never land on this position.
app.set('trust proxy', 2);

// ── Client identification ────────────────────────────────────────────────────
// See lib/clientIp.ts. Falls back to a shared key, which is what this limiter
// already was before per-client keying existed.
const clientKey = (req: express.Request): string => clientIp(req) ?? 'shared';

// ── Rate limiters ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Request rate limit exceeded' },
});

// Credential endpoints need their own budget: the POS PIN is only four digits,
// so the 300/min API allowance alone would let one client walk the entire
// keyspace in about half an hour. Successful logins are not counted, so normal
// staff use never consumes it — only failures do.
//
// If the client cannot be identified this limiter disables itself rather than
// falling back to the shared bucket: 10 failures is a per-client budget, and
// applied globally it would lock every branch out of the POS the moment staff
// somewhere mistyped a PIN ten times. Degrading to the previous behaviour is the
// safe direction; apiLimiter still caps total traffic.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: clientKey,
  skip: (req) => clientIp(req) === null,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' },
});

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Idle-connection timeout, kept under the 40s proxy_read_timeout in
// nginx/nginx.conf so a stalled request returns our JSON error rather than a bare
// gateway timeout. This must be registered before the routes: middleware runs in
// registration order, and it previously sat below them, so any matched route
// answered and returned without it ever executing.
app.use((_req, res, next) => {
  res.setTimeout(30000, () => {
    // Streaming responses (e.g. the database export) may already have sent
    // headers — setting a status at that point throws.
    if (!res.headersSent) res.status(503).json({ error: 'Request timeout' });
  });
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/dept-reconcile', deptReconcileRoutes);
app.use('/api/blocked-barcodes', blockedBarcodesRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/branch-kpi', branchKpiRoutes);
app.use('/api/notifications', notificationsRoutes);
// Removed /api/report-templates route

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Audit log retention cleanup (keep 1000 days) ─────────────────────────────
const cleanAuditLogs = async () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1000);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (result.count > 0) console.log(`[audit] Cleaned ${result.count} log(s) older than 1000 days`);
};
cleanAuditLogs().catch(console.error);
setInterval(() => cleanAuditLogs().catch(console.error), 24 * 60 * 60 * 1000);

const server = app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

// Graceful shutdown on SIGTERM (Docker stop)
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    console.log('Server closed');
    process.exit(0);
  });
});
