import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import multer from 'multer';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';
import { parseBranchExcel } from '../lib/branchParser';

const router = Router();
const EXCEL_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (EXCEL_MIME.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('อนุญาตเฉพาะไฟล์ Excel (.xlsx, .xls) เท่านั้น'));
    }
  },
});

const safeBranch = (b: any) => {
  const { accessToken, ...rest } = b;
  return rest;
};

// POST import/preview
router.post('/import/preview', authenticate, requireAdmin, importUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาอัพโหลดไฟล์ Excel' });
    const existing = await prisma.branch.findMany({ select: { code: true } });
    const codes = new Set(existing.map((b) => b.code));
    const rows = await parseBranchExcel(req.file.buffer, codes);
    res.json(rows);
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'วิเคราะห์ไฟล์ไม่สำเร็จ' });
  }
});

// POST import/submit
router.post('/import/submit', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = req.body as { rows: Array<any> };
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'ไม่มีข้อมูลที่นำเข้าได้' });

    let count = 0;
    for (const row of rows) {
      if (!row.code || !row.name) continue;
      await prisma.branch.upsert({
        where: { code: row.code },
        update: {
          name: row.name,
          address: row.address,
          reportBranchId: row.reportBranchId || null,
          type: row.type || 'PERMANENT',
        },
        create: {
          code: row.code,
          name: row.name,
          address: row.address,
          reportBranchId: row.reportBranchId || null,
          type: row.type || 'PERMANENT',
          active: true,
        },
      });
      count++;
    }
    res.json({ message: `นำเข้า ${count} สาขาเรียบร้อย`, count });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'นำเข้าไม่สำเร็จ' });
  }
});

// GET all branches
router.get('/', authenticate, async (_req, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
    res.json(branches.map(safeBranch));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single branch
router.get('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
    if (!branch) return res.status(404).json({ error: 'ไม่พบสาขา' });
    res.json(safeBranch(branch));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone, pincode, type, reportBranchId, tags } = req.body;
    const data: any = { name, code, address, phone };

    if (type) data.type = type;
    if (reportBranchId !== undefined) data.reportBranchId = reportBranchId || null;
    if (Array.isArray(tags)) data.tags = tags.map((t: string) => t.trim()).filter(Boolean);

    if (pincode && String(pincode).trim()) {
      if (!/^\d{4}$/.test(String(pincode).trim())) {
        return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4 หลัก' });
      }
      data.pincode = String(pincode).trim();
    }
    const branch = await prisma.branch.create({ data });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'CREATE_BRANCH',
      entity: 'Branch',
      entityId: branch.id,
      ip: getClientIp(req),
      detail: { name: branch.name, code: branch.code }
    });

    res.status(201).json(safeBranch(branch));
  } catch (err: any) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('pincode') ? 'รหัส PIN' : 'รหัสสาขา';
      return res.status(400).json({ error: `${field}นี้มีอยู่แล้ว` });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, address, phone, active, pincode, type, reportBranchId, tags } = req.body;
    const data: any = { name, code, address, phone, active };

    if (type !== undefined) data.type = type;
    if (reportBranchId !== undefined) data.reportBranchId = reportBranchId || null;
    if (Array.isArray(tags)) data.tags = tags.map((t: string) => t.trim()).filter(Boolean);

    if (pincode !== undefined) {
      if (pincode === '' || pincode === null) {
        data.pincode = null;
      } else if (/^\d{4}$/.test(String(pincode).trim())) {
        data.pincode = String(pincode).trim();
      } else {
        return res.status(400).json({ error: 'PIN ต้องเป็นตัวเลข 4 หลัก' });
      }
    }

    const branch = await prisma.branch.update({ where: { id: req.params.id }, data });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE_BRANCH',
      entity: 'Branch',
      entityId: branch.id,
      ip: getClientIp(req),
      detail: { name: branch.name, code: branch.code }
    });

    res.json(safeBranch(branch));
  } catch (err: any) {
    if (err.code === 'P2002') {
      const field = err.meta?.target?.includes('pincode') ? 'รหัส PIN' : 'รหัสสาขา';
      return res.status(400).json({ error: `${field}นี้มีอยู่แล้ว` });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE bulk
router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    await prisma.branch.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `ลบ ${ids.length} สาขาเรียบร้อย` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE single
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const branch = await prisma.branch.findUnique({ where: { id: req.params.id } });
    if (!branch) return res.status(404).json({ error: 'ไม่พบสาขา' });

    await prisma.branch.delete({ where: { id: req.params.id } });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'DELETE_BRANCH',
      entity: 'Branch',
      entityId: branch.id,
      ip: getClientIp(req),
      detail: { name: branch.name, code: branch.code }
    });

    res.json({ message: 'ลบเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
