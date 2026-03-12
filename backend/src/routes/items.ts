import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { search, category, active } = req.query;
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
    const items = await prisma.item.findMany({ where, orderBy: { name: 'asc' } });
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/barcode/:barcode', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const item = await prisma.item.findUnique({ where: { barcode: req.params.barcode } });
    if (!item || !item.active) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/categories', authenticate, async (_req, res: Response) => {
  try {
    const cats = await prisma.item.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    res.json(cats.map((c) => c.category).filter(Boolean));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, requireAdmin, upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    const { sku, barcode, name, description, defaultPrice, category } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const item = await prisma.item.create({
      data: { sku, barcode, name, description, defaultPrice: parseFloat(defaultPrice), category, imageUrl },
    });
    res.status(201).json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'SKU or barcode already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticate, requireAdmin, upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    let imageUrl = existing.imageUrl;
    if (req.file) {
      if (existing.imageUrl) {
        const old = path.join(__dirname, '../../uploads', path.basename(existing.imageUrl));
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const { sku, barcode, name, description, defaultPrice, category, active } = req.body;
    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: {
        sku, barcode, name, description,
        defaultPrice: parseFloat(defaultPrice),
        category, imageUrl,
        active: active !== undefined ? (active === 'true' || active === true) : undefined,
      },
    });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'SKU or barcode already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/bulk', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    await prisma.item.deleteMany({ where: { id: { in: ids } } });
    res.json({ message: `${ids.length} items deleted` });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const item = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.imageUrl) {
      const imgPath = path.join(__dirname, '../../uploads', path.basename(item.imageUrl));
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    await prisma.item.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/bulk-import', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { items } = req.body as { items: any[] };
    let created = 0, updated = 0;
    for (const it of items) {
      await prisma.item.upsert({
        where: { sku: it.sku },
        update: { barcode: it.barcode, name: it.name, description: it.description, defaultPrice: parseFloat(it.defaultPrice), category: it.category },
        create: { sku: it.sku, barcode: it.barcode, name: it.name, description: it.description, defaultPrice: parseFloat(it.defaultPrice), category: it.category },
      }).then((r) => {
        if (r.createdAt.getTime() === r.updatedAt.getTime()) created++; else updated++;
      });
    }
    res.json({ message: `Imported ${items.length} items`, created, updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

export default router;
