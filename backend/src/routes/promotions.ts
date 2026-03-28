import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /promotions — list all (active filter via ?active=true)
router.get('/', authenticate, async (req, res: Response) => {
  try {
    const where: any = {};
    if (req.query.active === 'true') where.active = true;
    const promotions = await prisma.promotion.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(promotions);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /promotions — create
router.post('/', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, buyQty, freeQty, active = true } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อโปรโมชั่น' });
    const bq = Number(buyQty);
    const fq = Number(freeQty);
    if (!Number.isInteger(bq) || bq < 1) return res.status(400).json({ error: 'จำนวนซื้อต้องเป็นจำนวนเต็มบวก' });
    if (!Number.isInteger(fq) || fq < 1) return res.status(400).json({ error: 'จำนวนฟรีต้องเป็นจำนวนเต็มบวก' });
    const promo = await prisma.promotion.create({
      data: { name: name.trim(), buyQty: bq, freeQty: fq, active: Boolean(active) },
    });
    res.status(201).json(promo);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /promotions/:id — update
router.put('/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, buyQty, freeQty, active } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (buyQty !== undefined) {
      const bq = Number(buyQty);
      if (!Number.isInteger(bq) || bq < 1) return res.status(400).json({ error: 'จำนวนซื้อต้องเป็นจำนวนเต็มบวก' });
      data.buyQty = bq;
    }
    if (freeQty !== undefined) {
      const fq = Number(freeQty);
      if (!Number.isInteger(fq) || fq < 1) return res.status(400).json({ error: 'จำนวนฟรีต้องเป็นจำนวนเต็มบวก' });
      data.freeQty = fq;
    }
    if (active !== undefined) data.active = Boolean(active);
    const promo = await prisma.promotion.update({ where: { id: req.params.id }, data });
    res.json(promo);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /promotions/:id
router.delete('/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.promotion.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
