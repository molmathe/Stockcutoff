import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

const ALLOWED = [
  'name', 'description', 'columnDate', 'columnBarcode', 'columnSku',
  'columnPrice', 'columnQty', 'columnBranchId', 'columnBranchName',
  'branchMatchBy', 'itemMatchBy',
];

const sanitize = (body: any) =>
  Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED.includes(k)));

// GET all templates
router.get('/', authenticate, requireAdmin, async (_req, res: Response) => {
  try {
    const templates = await prisma.reportTemplate.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(templates);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single template
router.get('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    const template = await prisma.reportTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: 'ไม่พบเทมเพลต' });
    res.json(template);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = sanitize(req.body);
    if (!data.name) return res.status(400).json({ error: 'กรุณาระบุชื่อเทมเพลต' });
    const template = await prisma.reportTemplate.create({ data: data as any });
    res.status(201).json(template);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const data = sanitize(req.body);
    const template = await prisma.reportTemplate.update({
      where: { id: req.params.id },
      data: data as any,
    });
    res.json(template);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE
router.delete('/:id', authenticate, requireAdmin, async (req, res: Response) => {
  try {
    await prisma.reportTemplate.delete({ where: { id: req.params.id } });
    res.json({ message: 'ลบเทมเพลตเรียบร้อย' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
