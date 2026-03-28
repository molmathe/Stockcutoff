import { Router, Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { logAudit, getClientIp } from '../lib/audit';

const router = Router();

const EXCEL_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const upload = multer({
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

// GET all blocked barcodes
router.get('/', authenticate, requireAdmin, async (_req, res: Response) => {
  try {
    const rows = await prisma.blockedBarcode.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create single
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { barcode, reason } = req.body;
    if (!barcode?.trim()) return res.status(400).json({ error: 'กรุณาระบุบาร์โค้ด' });
    const actor = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    const row = await prisma.blockedBarcode.create({
      data: { barcode: barcode.trim(), reason: reason?.trim() || null, createdBy: actor?.name ?? req.user!.id },
    });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'BLOCK_BARCODE',
      entity: 'BlockedBarcode',
      entityId: row.id,
      ip: getClientIp(req),
      detail: { barcode: row.barcode, reason: row.reason }
    });

    res.status(201).json(row);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'บาร์โค้ดนี้มีอยู่ในรายการแล้ว' });
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update reason
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { barcode, reason } = req.body;
    if (!barcode?.trim()) return res.status(400).json({ error: 'กรุณาระบุบาร์โค้ด' });
    const row = await prisma.blockedBarcode.update({
      where: { id: req.params.id },
      data: { barcode: barcode.trim(), reason: reason?.trim() || null },
    });
    res.json(row);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'บาร์โค้ดนี้มีอยู่ในรายการแล้ว' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'ไม่พบรายการ' });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE bulk
router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'กรุณาระบุรายการที่ต้องการลบ' });
    const result = await prisma.blockedBarcode.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `ลบ ${result.count} รายการเรียบร้อย`, count: result.count });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE single
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const row = await prisma.blockedBarcode.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'ไม่พบรายการ' });

    await prisma.blockedBarcode.delete({ where: { id: req.params.id } });

    // Audit log
    await logAudit({
      userId: req.user!.id,
      action: 'UNBLOCK_BARCODE',
      entity: 'BlockedBarcode',
      entityId: row.id,
      ip: getClientIp(req),
      detail: { barcode: row.barcode }
    });

    res.json({ message: 'ลบเรียบร้อย' });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'ไม่พบรายการ' });
    res.status(500).json({ error: 'Server error' });
  }
});

// POST import from Excel
router.post('/import', authenticate, requireAdmin, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาอัพโหลดไฟล์ Excel' });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'ไม่พบชีตในไฟล์ Excel' });

    // Parse header row to find columns
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? '').toLowerCase().trim();
    });
    const barcodeColIdx = headers.findIndex((h) => ['barcode', 'บาร์โค้ด'].includes(h));
    const barcodeCol = barcodeColIdx >= 0 ? barcodeColIdx + 1 : 1; // default col 1
    const reasonColIdx = headers.findIndex((h) => ['reason', 'เหตุผล', 'หมายเหตุ'].includes(h));
    const reasonCol = reasonColIdx >= 0 ? reasonColIdx + 1 : 0;

    // Collect rows synchronously first
    const dataRows: { barcode: string; reason: string | null }[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const barcode = String(row.getCell(barcodeCol).value ?? '').trim();
      const reason = reasonCol > 0 ? String(row.getCell(reasonCol).value ?? '').trim() || null : null;
      dataRows.push({ barcode, reason });
    });

    const actor = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    const actorName = actor?.name ?? req.user!.id;

    let created = 0, skipped = 0;
    const errors: string[] = [];

    for (const { barcode, reason } of dataRows) {
      if (!barcode) { skipped++; continue; }
      try {
        await prisma.blockedBarcode.upsert({
          where: { barcode },
          update: { reason, updatedAt: new Date() },
          create: { barcode, reason, createdBy: actorName },
        });
        created++;
      } catch {
        errors.push(barcode);
      }
    }

    res.json({ message: `นำเข้าเรียบร้อย: ${created} รายการ (ข้าม ${skipped})`, created, skipped, errors });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'นำเข้าไม่สำเร็จ' });
  }
});

export default router;
