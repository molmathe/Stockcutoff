import { Router, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { parseExcelData, ImportPlatform } from '../lib/excelParsers';
import { logAudit, getClientIp } from '../lib/audit';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const round2 = (n: number) => Math.round(n * 100) / 100;

const toThaiDateStr = (d: Date): string => {
  const thai = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return thai.toISOString().split('T')[0];
};

const generateBillNumber = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `B${date}-${uuidv4().split('-')[0].toUpperCase()}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /dept-reconcile/preview
// Upload consolidated report → compute dept store sales by subtracting POS booth
// ─────────────────────────────────────────────────────────────────────────────
router.post('/preview', authenticate, requireSuperAdmin, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const platform = req.body.platform as ImportPlatform;
    if (!platform || !['CENTRAL', 'MBK', 'PLAYHOUSE'].includes(platform)) {
      return res.status(400).json({ error: 'กรุณาเลือกแพลตฟอร์ม' });
    }
    if (!req.file) return res.status(400).json({ error: 'กรุณาอัปโหลดไฟล์ Excel' });

    // ── 1. Parse Excel ────────────────────────────────────────────────────────
    const parsed = await parseExcelData(req.file.buffer, platform);

    const errorLogs: any[] = [];

    // ── 2. Aggregate consolidated rows by (date, branchCode, itemCode) ────────
    //       Handles duplicate rows in the same report by summing qty + amount
    const consolidatedMap = new Map<string, {
      date: string; rawBranch: string; rawItem: string;
      qty: number; totalAmount: number; rowNums: number[];
    }>();

    for (const row of parsed) {
      if (!row.saleDate || !row.rawBranch || !row.rawItem) {
        errorLogs.push({
          date: row.rawDate || '',
          rawBranch: row.rawBranch || '',
          rawItem: row.rawItem || '',
          qty: row.qty,
          amount: round2(row.price * row.qty),
          issue: 'INVALID_DATA',
          detail: `แถว ${row.rowNum}: ข้อมูลไม่ครบ (วันที่/สาขา/สินค้า)`,
          rowNum: row.rowNum,
        });
        continue;
      }

      const dateStr = toThaiDateStr(row.saleDate);
      const key = `${dateStr}|${row.rawBranch.trim()}|${row.rawItem.trim()}`;
      const totalAmount = round2(row.price * row.qty);
      const existing = consolidatedMap.get(key);
      if (existing) {
        existing.qty += row.qty;
        existing.totalAmount = round2(existing.totalAmount + totalAmount);
        existing.rowNums.push(row.rowNum);
      } else {
        consolidatedMap.set(key, {
          date: dateStr, rawBranch: row.rawBranch.trim(), rawItem: row.rawItem.trim(),
          qty: row.qty, totalAmount, rowNums: [row.rowNum],
        });
      }
    }

    // ── 3. Resolve branches by reportBranchId ────────────────────────────────
    //       PERMANENT → used for output / bill creation
    //       All types (BOOTH included) → used to fetch booth POS bills
    const uniqueBranchCodes = [...new Set([...consolidatedMap.values()].map(r => r.rawBranch))];
    const branches = await prisma.branch.findMany({
      where: { reportBranchId: { in: uniqueBranchCodes }, type: 'PERMANENT', active: true },
      select: { id: true, name: true, code: true, reportBranchId: true },
    });
    const branchByCode = new Map(branches.map(b => [b.reportBranchId!, b]));

    // Fetch ALL branches sharing those reportBranchIds (includes BOOTH branches)
    const allRelatedBranches = await prisma.branch.findMany({
      where: { reportBranchId: { in: uniqueBranchCodes }, active: true },
      select: { id: true, reportBranchId: true },
    });
    // Map every branch ID (any type) → the PERMANENT branch ID for that reportBranchId
    const anyBranchIdToPermId = new Map<string, string>();
    for (const b of allRelatedBranches) {
      const perm = branchByCode.get(b.reportBranchId!);
      if (perm) anyBranchIdToPermId.set(b.id, perm.id);
    }
    const allRelatedBranchIds = allRelatedBranches.map(b => b.id);

    // ── 4. Resolve items (barcode → SKU fallback) ─────────────────────────────
    const uniqueItemCodes = [...new Set([...consolidatedMap.values()].map(r => r.rawItem))];
    const items = await prisma.item.findMany({
      where: {
        OR: [{ barcode: { in: uniqueItemCodes } }, { sku: { in: uniqueItemCodes } }],
        active: true,
      },
      select: { id: true, name: true, sku: true, barcode: true },
    });
    const itemByBarcode = new Map(items.map(i => [i.barcode, i]));
    const itemBySku    = new Map(items.map(i => [i.sku, i]));
    const resolveItem  = (raw: string) => itemByBarcode.get(raw) || itemBySku.get(raw) || null;

    // ── 5. Fetch ALL booth POS BillItems for matching branches + date range ───
    //       Single bulk query — far cheaper than N×M queries
    const boothMap = new Map<string, { qty: number; amount: number; itemSku: string; itemBarcode: string }>();

    if (branches.length > 0) {
      const allDates = [...new Set([...consolidatedMap.values()].map(r => r.date))].sort();
      const rangeStart = new Date(`${allDates[0]}T00:00:00+07:00`);
      const rangeEnd   = new Date(`${allDates[allDates.length - 1]}T23:59:59.999+07:00`);

      const boothItems = await prisma.billItem.findMany({
        where: {
          bill: {
            branchId: { in: allRelatedBranchIds }, // includes BOOTH branches
            source: 'POS',
            status: 'SUBMITTED',
            createdAt: { gte: rangeStart, lte: rangeEnd },
          },
        },
        include: {
          bill: { select: { branchId: true, createdAt: true } },
          item: { select: { id: true, sku: true, barcode: true } },
        },
      });

      for (const bi of boothItems) {
        const billDate = toThaiDateStr(bi.bill.createdAt);
        if (!allDates.includes(billDate)) continue;
        // Normalize to PERMANENT branch ID so key matches consolidated lookup
        const permBranchId = anyBranchIdToPermId.get(bi.bill.branchId) ?? bi.bill.branchId;
        const key = `${billDate}|${permBranchId}|${bi.item.id}`;
        const existing = boothMap.get(key);
        const amount = round2(Number(bi.subtotal));
        if (existing) {
          existing.qty += bi.quantity;
          existing.amount = round2(existing.amount + amount);
        } else {
          boothMap.set(key, { qty: bi.quantity, amount, itemSku: bi.item.sku, itemBarcode: bi.item.barcode });
        }
      }
    }

    // ── 6. Subtraction algorithm ──────────────────────────────────────────────
    const deptStoreSales: any[] = [];
    const reviewNeeded:   any[] = [];
    const consumedBoothKeys = new Set<string>();

    for (const [, row] of consolidatedMap) {
      const branch = branchByCode.get(row.rawBranch);
      if (!branch) {
        errorLogs.push({
          date: row.date, rawBranch: row.rawBranch, rawItem: row.rawItem,
          qty: row.qty, amount: row.totalAmount,
          issue: 'UNKNOWN_BRANCH',
          detail: `ไม่พบสาขา PERMANENT ที่มี reportBranchId = "${row.rawBranch}"`,
          rowNum: row.rowNums[0],
        });
        continue;
      }

      const item = resolveItem(row.rawItem);
      if (!item) {
        errorLogs.push({
          date: row.date, rawBranch: row.rawBranch, rawItem: row.rawItem,
          qty: row.qty, amount: row.totalAmount,
          issue: 'UNKNOWN_ITEM',
          detail: `ไม่พบสินค้า barcode/SKU = "${row.rawItem}"`,
          rowNum: row.rowNums[0],
        });
        continue;
      }

      const boothKey = `${row.date}|${branch.id}|${item.id}`;
      const booth = boothMap.get(boothKey) ?? { qty: 0, amount: 0 };
      consumedBoothKeys.add(boothKey);

      const storeQty    = round2(row.qty - booth.qty);
      const storeAmount = round2(row.totalAmount - booth.amount);
      const isNegQty    = storeQty    < 0;
      const isNegAmt    = storeAmount < 0;

      const baseRow = {
        date: row.date, branchId: branch.id, branchName: branch.name, branchCode: row.rawBranch,
        itemId: item.id, itemName: item.name, itemSku: item.sku, itemBarcode: item.barcode,
        consolidatedQty: row.qty, consolidatedAmount: row.totalAmount,
        boothQty: booth.qty, boothAmount: booth.amount,
        storeQty, storeAmount,
      };

      if (isNegQty || isNegAmt) {
        reviewNeeded.push({
          ...baseRow,
          issue: isNegQty && isNegAmt ? 'NEGATIVE_BOTH' : isNegQty ? 'NEGATIVE_QTY' : 'NEGATIVE_AMOUNT',
        });
      } else {
        deptStoreSales.push({
          ...baseRow,
          unitPrice: storeQty > 0 ? round2(storeAmount / storeQty) : 0,
        });
      }
    }

    // ── 7. Orphan booth records (scanned but not in consolidated report) ───────
    for (const [key, booth] of boothMap) {
      if (consumedBoothKeys.has(key)) continue;
      if (booth.qty === 0) continue;
      const [date, branchId] = key.split('|');
      const branch = branches.find(b => b.id === branchId); // key already normalized to PERMANENT id
      errorLogs.push({
        date, rawBranch: branch?.reportBranchId || branchId,
        rawItem: booth.itemBarcode || booth.itemSku,
        qty: booth.qty, amount: booth.amount,
        issue: 'ORPHANED_BOOTH',
        detail: `บูธสแกนขาย "${booth.itemBarcode || booth.itemSku}" วันที่ ${date} แต่ไม่ปรากฏในรายงาน Consolidated`,
        rowNum: null,
      });
    }

    res.json({
      platform,
      stats: {
        consolidatedRows: consolidatedMap.size,
        deptStoreRows: deptStoreSales.length,
        reviewRows: reviewNeeded.length,
        errorRows: errorLogs.length,
        totalDeptQty: deptStoreSales.reduce((s: number, r: any) => s + r.storeQty, 0),
        totalDeptAmount: round2(deptStoreSales.reduce((s: number, r: any) => s + r.storeAmount, 0)),
      },
      deptStoreSales,
      reviewNeeded,
      errorLogs,
    });
  } catch (err: any) {
    console.error('[deptReconcile preview]', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /dept-reconcile/submit
// Create IMPORT Bills for dept store portion; push review rows to UnresolvedSales
// ─────────────────────────────────────────────────────────────────────────────
router.post('/submit', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { platform, deptStoreSales, reviewNeeded, fileName, draftId, force } = req.body;

    if (!Array.isArray(deptStoreSales) || deptStoreSales.length === 0) {
      return res.status(400).json({ error: 'ไม่มีข้อมูลที่จะนำเข้า' });
    }

    // ── Duplicate detection (unless force=true) ───────────────────────────────
    if (!force) {
      const saleDates = [...new Set(deptStoreSales.map((r: any) => r.date as string))];
      const branchIds = [...new Set(deptStoreSales.map((r: any) => r.branchId as string).filter(Boolean))];
      const dateRanges = saleDates.map(d => ({
        gte: new Date(`${d}T00:00:00+07:00`),
        lte: new Date(`${d}T23:59:59.999+07:00`),
      }));
      const existingBills = await prisma.bill.findMany({
        where: {
          source: 'IMPORT',
          importPlatform: platform || null,
          branchId: { in: branchIds },
          status: 'SUBMITTED',
          OR: dateRanges.map(r => ({ saleDate: r })),
        },
        select: { saleDate: true, branchId: true, branch: { select: { name: true } } },
      });
      if (existingBills.length > 0) {
        const conflicts = existingBills.map((b: any) => ({
          saleDate: b.saleDate ? new Date(b.saleDate.getTime() + 7 * 3600000).toISOString().split('T')[0] : '',
          branchName: b.branch?.name || b.branchId,
        }));
        return res.status(409).json({
          error: 'พบข้อมูลที่นำเข้าซ้ำ',
          conflicts,
          hint: 'ส่ง force=true เพื่อนำเข้าซ้ำ',
        });
      }
    }

    // Group by (date, branchId) → one Bill per group
    const billGroups = new Map<string, any[]>();
    for (const row of deptStoreSales) {
      if (row.storeQty <= 0 && row.storeAmount <= 0) continue;
      const key = `${row.date}|${row.branchId}`;
      if (!billGroups.has(key)) billGroups.set(key, []);
      billGroups.get(key)!.push(row);
    }

    let importedBills = 0;

    await prisma.$transaction(async (tx) => {
      for (const [, rows] of billGroups) {
        const { date, branchId } = rows[0];
        const subtotal = round2(rows.reduce((s: number, r: any) => s + r.storeAmount, 0));

        await tx.bill.create({
          data: {
            billNumber: generateBillNumber(),
            branchId,
            userId: req.user!.id,
            status: 'SUBMITTED',
            source: 'IMPORT',
            importPlatform: platform || null,
            saleDate: new Date(`${date}T12:00:00+07:00`),
            submittedAt: new Date(),
            subtotal,
            discount: 0,
            total: subtotal,
            notes: `Dept reconcile · ${fileName || platform}`,
            items: {
              create: rows.map((r: any) => ({
                itemId: r.itemId,
                quantity: r.storeQty > 0 ? r.storeQty : 1,
                price: r.unitPrice || 0,
                discount: 0,
                subtotal: r.storeAmount,
              })),
            },
          },
        });
        importedBills++;
      }

      // Push review_needed into UnresolvedSales
      if (Array.isArray(reviewNeeded) && reviewNeeded.length > 0) {
        await tx.unresolvedSale.createMany({
          data: reviewNeeded.map((r: any) => ({
            userId: req.user!.id,
            platform: platform || 'UNKNOWN',
            fileName: fileName || 'dept-reconcile',
            saleDate: r.date,
            rawDate: r.date,
            rawBranch: r.branchCode || r.branchName || '',
            rawItem: r.itemBarcode || r.itemSku || '',
            qty: Math.abs(r.storeQty) || r.consolidatedQty || 0,
            price: Math.abs(r.storeAmount) || r.consolidatedAmount || 0,
            status: 'PENDING',
            errors: {
              issue: r.issue,
              consolidatedQty: r.consolidatedQty,
              consolidatedAmount: r.consolidatedAmount,
              boothQty: r.boothQty,
              boothAmount: r.boothAmount,
              storeQty: r.storeQty,
              storeAmount: r.storeAmount,
            },
          })),
        });
      }
    });

    logAudit({
      userId: req.user!.id,
      action: 'DEPT_RECONCILE',
      entity: 'Bill',
      detail: { platform, importedBills, reviewCount: reviewNeeded?.length || 0, fileName },
      ip: getClientIp(req),
    });

    // Auto-delete draft after successful submit
    if (draftId) {
      await prisma.importDraft.deleteMany({ where: { id: draftId } }).catch(() => {});
    }

    res.json({
      success: true,
      message: `นำเข้าข้อมูล Dept Store สำเร็จ ${importedBills} บิล`,
      importedBills,
    });
  } catch (err: any) {
    console.error('[deptReconcile submit]', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Draft CRUD  (reuses ImportDraft model; platform prefixed with "RECONCILE_")
// ─────────────────────────────────────────────────────────────────────────────

// GET /dept-reconcile/drafts
router.get('/drafts', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const drafts = await prisma.importDraft.findMany({
      where: { userId: req.user!.id, platform: { startsWith: 'RECONCILE_' } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, platform: true, fileName: true, createdAt: true, updatedAt: true },
    });
    res.json(drafts);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /dept-reconcile/draft  (create or update)
router.post('/draft', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { draftId, platform, fileName, previewData } = req.body;
    const storedPlatform = `RECONCILE_${platform}`;

    let id = draftId;
    if (id) {
      await prisma.importDraft.update({
        where: { id },
        data: { fileName, rowsData: previewData as any, updatedAt: new Date() },
      });
    } else {
      const draft = await prisma.importDraft.create({
        data: { userId: req.user!.id, platform: storedPlatform, fileName, rowsData: previewData as any },
      });
      id = draft.id;
    }
    res.json({ success: true, draftId: id });
  } catch {
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// POST /dept-reconcile/draft/:id/resume
router.post('/draft/:id/resume', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const draft = await prisma.importDraft.findUnique({ where: { id: req.params.id } });
    if (!draft) return res.status(404).json({ error: 'ไม่พบฉบับร่าง' });
    const data = draft.rowsData as any;
    res.json({
      ...data,
      draftId: draft.id,
      _fileName: draft.fileName,
      platform: data.platform || draft.platform.replace('RECONCILE_', ''),
    });
  } catch {
    res.status(500).json({ error: 'Failed to resume draft' });
  }
});

// DELETE /dept-reconcile/draft/:id
router.delete('/draft/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.importDraft.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

export default router;
