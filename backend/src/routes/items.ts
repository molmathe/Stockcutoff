import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { parseItemExcel } from '../lib/itemParser';
import multer from 'multer';

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

// POST import/preview
router.post('/import/preview', authenticate, requireAdmin, importUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาอัพโหลดไฟล์ Excel' });
    const existing = await prisma.item.findMany({ select: { barcode: true } });
    const barcodes = new Set(existing.map((b) => b.barcode));
    const rows = await parseItemExcel(req.file.buffer, barcodes);
    res.json(rows);
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'วิเคราะห์ไฟล์ไม่สำเร็จ' });
  }
});

// Get all items (with optional pagination)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { search, category, active, page, limit } = req.query;
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } },
        { barcode: { contains: search as string } },
      ];
    }
    if (category) where.category = category;
    if (active !== undefined) where.active = active === 'true';

    // Pagination (only when ?page is provided)
    if (page !== undefined) {
      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50));
      const skip = (pageNum - 1) * limitNum;
      const [items, total] = await Promise.all([
        prisma.item.findMany({ where, orderBy: { name: 'asc' }, skip, take: limitNum }),
        prisma.item.count({ where }),
      ]);
      return res.json({ items, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });
    }

    const items = await prisma.item.findMany({ where, orderBy: { name: 'asc' } });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get by barcode — must be before /:id pattern routes
router.get('/barcode/:barcode', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const code = req.params.barcode;
    const blocked = await prisma.blockedBarcode.findUnique({ where: { barcode: code } });
    if (blocked) {
      return res.status(403).json({ error: 'บาร์โค้ดนี้ถูกระงับการใช้งาน กรุณาสแกนบาร์โค้ดสินค้าอีกครั้ง', blocked: true });
    }
    const item = await prisma.item.findUnique({ where: { barcode: code } });
    if (!item || !item.active) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get categories from Category table
router.get('/categories', authenticate, async (_req, res: Response) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { name: 'asc' }, select: { name: true } });
    res.json(cats.map((c) => c.name));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create item
router.post('/', authenticate, requireAdmin, upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    const { sku, barcode, name, description, defaultPrice, category } = req.body;
    if (!sku || !barcode || !name || defaultPrice === undefined) {
      return res.status(400).json({ error: 'กรุณากรอก SKU, บาร์โค้ด, ชื่อสินค้า และราคา' });
    }
    const price = parseFloat(defaultPrice);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'ราคาไม่ถูกต้อง' });
    }
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const item = await prisma.item.create({
      data: { sku, barcode, name, description, defaultPrice: price, category: category || null, imageUrl },
    });
    res.status(201).json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'SKU หรือบาร์โค้ดซ้ำ' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk delete — must be before /:id
router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'กรุณาระบุรายการที่ต้องการลบ' });
    }
    await prisma.item.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `ลบ ${ids.length} สินค้า` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk CSV import — must be before /:id
router.post('/bulk-import', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { items } = req.body as { items: any[] };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'ไม่มีข้อมูลสินค้า' });
    }
    let created = 0, updated = 0;
    const errors: string[] = [];
    for (const it of items) {
      if (!it.sku || !it.barcode || !it.name) {
        errors.push(`แถวไม่สมบูรณ์: ${JSON.stringify(it)}`);
        continue;
      }
      const price = parseFloat(it.defaultPrice);
      if (isNaN(price) || price < 0) {
        errors.push(`SKU ${it.sku}: ราคาไม่ถูกต้อง`);
        continue;
      }
      try {
        const existing = await prisma.item.findUnique({ where: { barcode: it.barcode } });
        await prisma.item.upsert({
          where: { barcode: it.barcode },
          update: { sku: it.sku, name: it.name, description: it.description || null, defaultPrice: price, category: it.category || null },
          create: { sku: it.sku, barcode: it.barcode, name: it.name, description: it.description || null, defaultPrice: price, category: it.category || null },
        });
        if (existing) updated++; else created++;
      } catch (e: any) {
        errors.push(`Barcode ${it.barcode}: บาร์โค้ดซ้ำ ไม่สามารถนำเข้าได้`);
      }
    }
    res.json({ message: `นำเข้าเรียบร้อย: สร้าง ${created}, อัพเดท ${updated}`, created, updated, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Bulk image upload matched by barcode filename — must be before /:id
router.post('/bulk-images', authenticate, requireAdmin, upload.array('images', 5000), async (req: AuthRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'ไม่มีไฟล์รูปภาพ' });

    const matched: { barcode: string; name: string; imageUrl: string }[] = [];
    const unmatched: string[] = [];

    for (const file of files) {
      const barcode = path.basename(file.originalname, path.extname(file.originalname)).trim();
      const item = await prisma.item.findUnique({ where: { barcode } });

      if (item) {
        if (item.imageUrl) {
          const oldPath = path.join(__dirname, '../../uploads', path.basename(item.imageUrl));
          try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch { /* ignore stale file */ }
        }
        const imageUrl = `/uploads/${file.filename}`;
        await prisma.item.update({ where: { id: item.id }, data: { imageUrl } });
        matched.push({ barcode, name: item.name, imageUrl });
      } else {
        try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch { /* ignore */ }
        unmatched.push(file.originalname);
      }
    }

    res.json({ matched, unmatched, total: files.length });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update item
router.put('/:id', authenticate, requireAdmin, upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'ไม่พบสินค้า' });

    let imageUrl = existing.imageUrl;
    if (req.file) {
      if (existing.imageUrl) {
        const old = path.join(__dirname, '../../uploads', path.basename(existing.imageUrl));
        try { if (fs.existsSync(old)) fs.unlinkSync(old); } catch { /* ignore stale file */ }
      }
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const { sku, barcode, name, description, defaultPrice, category, active } = req.body;
    const price = parseFloat(defaultPrice);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'ราคาไม่ถูกต้อง' });
    }

    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: {
        sku, barcode, name, description,
        defaultPrice: price,
        category: category || null,
        imageUrl,
        active: active !== undefined ? (active === 'true' || active === true) : undefined,
      },
    });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'บาร์โค้ดซ้ำ กรุณาใช้บาร์โค้ดอื่น' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete single item
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'ไม่พบสินค้า' });
    if (item.imageUrl) {
      const imgPath = path.join(__dirname, '../../uploads', path.basename(item.imageUrl));
      try { if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath); } catch { /* ignore stale file */ }
    }
    await prisma.item.delete({ where: { id: req.params.id } });
    res.json({ message: 'ลบเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
