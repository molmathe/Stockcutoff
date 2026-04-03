import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import path from 'path';
import { parseExcelData, ImportPlatform } from '../lib/excelParsers';

const router = Router();
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const MAX_IMPORT_ROWS = 10_000; // safety cap to prevent DoS via huge Excel files

// ─── Helpers ────────────────────────────────────────────────────────────────

// Thai time (UTC+7) day boundaries
const getThaiDayRange = () => {
  const now = new Date();
  const THAI_OFFSET_MS = 7 * 60 * 60 * 1000;
  const thaiNow = new Date(now.getTime() + THAI_OFFSET_MS);
  const thaiDateStr = thaiNow.toISOString().split('T')[0];
  const today = new Date(`${thaiDateStr}T00:00:00+07:00`);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return { today, tomorrow };
};

const buildWhere = (req: AuthRequest, query: any) => {
  const { branchId, startDate, endDate } = query;
  const where: Record<string, any> = { status: 'SUBMITTED' };

  if (req.user!.role === 'BRANCH_ADMIN' && req.user!.branchId) {
    where['branchId'] = req.user!.branchId;
  } else if (branchId) {
    where['branchId'] = branchId;
  }

  if (startDate || endDate) {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) {
      const e = new Date(endDate as string);
      e.setHours(23, 59, 59, 999);
      dateFilter.lte = e;
    }
    // For POS bills filter by createdAt; for IMPORT bills filter by saleDate
    where['OR'] = [
      { saleDate: null, createdAt: dateFilter },
      { saleDate: dateFilter },
    ];
  }
  return where;
};

const branchFilter = (req: AuthRequest): Record<string, any> => {
  if (req.user!.role === 'BRANCH_ADMIN' && req.user!.branchId) {
    return { branchId: req.user!.branchId };
  }
  return {};
};

/** Parse a cell value from ExcelJS into a JS Date */
function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    let d = new Date(value.trim());
    if (!isNaN(d.getTime())) return d;
    const m = value.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const year = parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      d = new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  if (value && typeof value === 'object' && value.richText) {
    return parseExcelDate(value.richText.map((r: any) => r.text).join(''));
  }
  return null;
}

function cellStr(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((r: any) => r.text).join('');
  }
  return String(value).trim();
}

function generateImportBillNumber(date: Date): string {
  const d = date.toISOString().split('T')[0].replace(/-/g, '');
  return `IMP${d}-${uuidv4().split('-')[0].toUpperCase().slice(0, 5)}`;
}

async function remapImportRows(inputRows: any[], maxRows = 10000) {
  const allBranches = await prisma.branch.findMany({ where: { active: true, deletedAt: null } });
  const allItems = await prisma.item.findMany({ where: { active: true } });

  const rows: any[] = [];
  let totalQty = 0;
  let totalRevenue = 0;
  let matched = 0;
  let rowCount = 0;

  for (const r of inputRows) {
    if (rowCount >= maxRows) break;
    rowCount++;

    let branch = null;
    let item = null;

    if (r.rawBranch) {
      const v = String(r.rawBranch).trim().toLowerCase();
      branch = allBranches.find(b =>
          b.name.toLowerCase() === v ||
          b.code.toLowerCase() === v ||
          (b.reportBranchId && b.reportBranchId.toLowerCase() === v) ||
          (b.tags && b.tags.some(tag => tag.toLowerCase() === v))
      ) || null;
    }

    if (r.rawItem) {
      const v = String(r.rawItem).trim().toLowerCase();
      item = allItems.find(i =>
          i.sku.toLowerCase() === v ||
          i.barcode.toLowerCase() === v
      ) || null;
    }

    const rowDiscount = Math.max(0, Number(r.discount) || 0);
    const rowNet = r.price * r.qty - rowDiscount;

    const errors: string[] = [];
    if (!r.saleDate) errors.push('วันที่ไม่ถูกต้อง');
    if (r.qty <= 0) errors.push('จำนวนต้องมากว่า 0');
    if (r.price < 0) errors.push('ราคาไม่ถูกต้อง');
    if (rowNet < 0) errors.push('ส่วนลดมากกว่าราคาขาย');
    if (!branch && r.rawBranch) errors.push(`ไม่พบสาขา: ${r.rawBranch}`);
    if (!item && r.rawItem) errors.push(`ไม่พบสินค้า: ${r.rawItem}`);

    const isMatched = !!(r.saleDate && branch && item && r.qty > 0 && r.price >= 0 && rowNet >= 0 && errors.length === 0);

    if (isMatched) {
      matched++;
      totalQty += r.qty;
      totalRevenue += rowNet; // Net revenue after discount
    }

    rows.push({
      rowNum: r.rowNum || rowCount,
      rawDate: r.rawDate,
      saleDate: r.saleDate ? (typeof r.saleDate === 'string' ? r.saleDate : r.saleDate.toISOString().split('T')[0]) : null,
      rawBranch: r.rawBranch,
      branchId: branch?.id || null,
      branchName: branch?.name || r.rawBranch,
      rawItem: r.rawItem,
      itemId: item?.id || null,
      itemName: item?.name || '',
      itemSku: item?.sku || '',
      itemBarcode: item?.barcode || '',
      qty: r.qty,
      price: r.price,
      discount: rowDiscount,
      status: isMatched ? 'matched' : errors.length ? 'invalid' : (!branch ? 'no_branch' : 'no_item'),
      errors,
    });
  }

  const truncated = rowCount >= maxRows;
  return {
    rows,
    stats: { total: rows.length, matched, unmatched: rows.length - matched, totalQty, totalRevenue, truncated, maxRows },
  };
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

router.get('/dashboard', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const bw = branchFilter(req);
    const { today, tomorrow } = getThaiDayRange();
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

    const dateFilterToday = { gte: today, lt: tomorrow };
    const dateFilter7Days = { gte: sevenDaysAgo };
    const whereToday: any = { ...bw, status: 'SUBMITTED', OR: [{ saleDate: null, createdAt: dateFilterToday }, { saleDate: dateFilterToday }] };
    const where7Days: any = { ...bw, status: 'SUBMITTED', OR: [{ saleDate: null, createdAt: dateFilter7Days }, { saleDate: dateFilter7Days }] };

    const [todayBills, recentBills, allBillsForItems] = await Promise.all([
      prisma.bill.findMany({
        where: whereToday,
        include: { items: true },
      }),
      prisma.bill.findMany({
        where: where7Days,
      }),
      prisma.bill.findMany({
        where: where7Days,
        include: { items: { include: { item: { select: { name: true, sku: true, barcode: true, imageUrl: true } } } } },
      }),
    ]);

    const todayRevenue = todayBills.reduce((s, b) => s + Number(b.total), 0);
    const todayItemsSold = todayBills.reduce((s, b) => s + b.items.reduce((si, i) => si + i.quantity, 0), 0);

    // Build 7-day revenue map using Thai date keys
    const THAI_OFFSET_MS = 7 * 60 * 60 * 1000;
    const dayMap: Record<string, { revenue: number; bills: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const thaiKey = new Date(d.getTime() + THAI_OFFSET_MS).toISOString().split('T')[0];
      dayMap[thaiKey] = { revenue: 0, bills: 0 };
    }
    for (const b of recentBills) {
      const recordDate = b.saleDate || b.createdAt;
      const key = new Date(recordDate.getTime() + THAI_OFFSET_MS).toISOString().split('T')[0];
      if (dayMap[key]) { dayMap[key].revenue += Number(b.total); dayMap[key].bills++; }
    }
    const revenueByDay = Object.entries(dayMap).map(([date, v]) => ({ date, ...v }));

    const itemMap: Record<string, { name: string; sku: string; barcode: string; imageUrl: string | null; qty: number; revenue: number }> = {};
    const discountMap: Record<string, { name: string; sku: string; barcode: string; imageUrl: string | null; qty: number; totalDiscount: number }> = {};
    for (const b of allBillsForItems) {
      for (const bi of b.items) {
        if (!itemMap[bi.itemId]) itemMap[bi.itemId] = { name: bi.item.name, sku: bi.item.sku, barcode: bi.item.barcode, imageUrl: bi.item.imageUrl, qty: 0, revenue: 0 };
        itemMap[bi.itemId].qty += bi.quantity;
        itemMap[bi.itemId].revenue += Number(bi.subtotal);
        if (Number(bi.discount) > 0) {
          if (!discountMap[bi.itemId]) discountMap[bi.itemId] = { name: bi.item.name, sku: bi.item.sku, barcode: bi.item.barcode, imageUrl: bi.item.imageUrl, qty: 0, totalDiscount: 0 };
          discountMap[bi.itemId].qty += bi.quantity;
          discountMap[bi.itemId].totalDiscount += Number(bi.discount);
        }
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const topDiscountItems = Object.values(discountMap).sort((a, b) => b.totalDiscount - a.totalDiscount).slice(0, 10);

    // Branch sales: use groupBy to avoid N+1 query
    let branchSales: any[] = [];
    if (req.user!.role === 'SUPER_ADMIN') {
      const [branches, grouped] = await Promise.all([
        prisma.branch.findMany({ where: { active: true, deletedAt: null }, select: { id: true, name: true } }),
        prisma.bill.groupBy({
          by: ['branchId'],
          where: where7Days,
          _sum: { total: true },
          _count: true,
        }),
      ]);
      const groupMap = new Map(grouped.map((g) => [g.branchId, g]));
      branchSales = branches.map((br) => {
        const g = groupMap.get(br.id);
        return { branch: br.name, revenue: Number(g?._sum.total || 0), bills: g?._count || 0 };
      });
    }

    res.json({ todayRevenue, todayBills: todayBills.length, todayItemsSold, revenueByDay, topItems, topDiscountItems, branchSales });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Sales summary ──────────────────────────────────────────────────────────

router.get('/sales', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true } },
        items: { include: { item: { select: { id: true, name: true, sku: true, barcode: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000, // safety cap
    });

    const totalRevenue = bills.reduce((s, b) => s + Number(b.total), 0);
    const itemSummary: Record<string, any> = {};
    for (const b of bills) {
      for (const bi of b.items) {
        if (!itemSummary[bi.itemId]) {
          itemSummary[bi.itemId] = { itemId: bi.itemId, name: bi.item.name, sku: bi.item.sku, qty: 0, revenue: 0 };
        }
        itemSummary[bi.itemId].qty += bi.quantity;
        itemSummary[bi.itemId].revenue += Number(bi.subtotal);
      }
    }
    res.json({
      bills,
      summary: { totalRevenue, totalBills: bills.length, items: Object.values(itemSummary).sort((a, b) => b.revenue - a.revenue) },
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Download (detailed Excel) ───────────────────────────────────────────────

router.get('/download', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        user: { select: { name: true } },
        items: { include: { item: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StockCutoff';

    const s1 = wb.addWorksheet('บิลขาย');
    s1.columns = [
      { header: 'เลขที่บิล', key: 'billNumber', width: 22 },
      { header: 'แหล่งที่มา', key: 'source', width: 10 },
      { header: 'สาขา', key: 'branch', width: 20 },
      { header: 'แคชเชียร์', key: 'cashier', width: 20 },
      { header: 'วันที่ขาย', key: 'date', width: 18 },
      { header: 'รายการ', key: 'items', width: 8 },
      { header: 'ยอดก่อนหัก', key: 'subtotal', width: 14 },
      { header: 'ส่วนลด', key: 'discount', width: 14 },
      { header: 'ยอดสุทธิ', key: 'total', width: 14 },
    ];
    bills.forEach((b) => {
      const saleDate = b.saleDate || b.createdAt;
      s1.addRow({
        billNumber: b.billNumber, source: b.source,
        branch: b.branch.name, cashier: b.user.name,
        date: saleDate.toLocaleString('th-TH'), items: b.items.length,
        subtotal: Number(b.subtotal), discount: Number(b.discount), total: Number(b.total),
      });
    });

    const s2 = wb.addWorksheet('รายการสินค้า');
    s2.columns = [
      { header: 'เลขที่บิล', key: 'bill', width: 22 },
      { header: 'สาขา', key: 'branch', width: 20 },
      { header: 'วันที่ขาย', key: 'date', width: 18 },
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'บาร์โค้ด', key: 'barcode', width: 18 },
      { header: 'ชื่อสินค้า', key: 'name', width: 30 },
      { header: 'จำนวน', key: 'qty', width: 8 },
      { header: 'ราคา', key: 'price', width: 14 },
      { header: 'ส่วนลด', key: 'discount', width: 14 },
      { header: 'ยอดรวม', key: 'subtotal', width: 14 },
    ];
    bills.forEach((b) => b.items.forEach((bi) => {
      const saleDate = b.saleDate || b.createdAt;
      s2.addRow({
        bill: b.billNumber, branch: b.branch.name,
        date: saleDate.toLocaleString('th-TH'),
        sku: bi.item.sku, barcode: bi.item.barcode, name: bi.item.name,
        qty: bi.quantity, price: Number(bi.price), discount: Number(bi.discount), subtotal: Number(bi.subtotal),
      });
    }));

    const s3 = wb.addWorksheet('สรุปสินค้า');
    s3.columns = [
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'ชื่อสินค้า', key: 'name', width: 30 },
      { header: 'จำนวนรวม', key: 'qty', width: 12 },
      { header: 'รายได้รวม', key: 'revenue', width: 16 },
    ];
    const itemMap: Record<string, any> = {};
    bills.forEach((b) => b.items.forEach((bi) => {
      if (!itemMap[bi.itemId]) itemMap[bi.itemId] = { sku: bi.item.sku, name: bi.item.name, qty: 0, revenue: 0 };
      itemMap[bi.itemId].qty += bi.quantity;
      itemMap[bi.itemId].revenue += Number(bi.subtotal);
    }));
    Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).forEach((r) => s3.addRow(r));

    [s1, s2, s3].forEach((s) => {
      s.getRow(1).font = { bold: true };
      s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
    });

    const filename = `รายงานยอดขาย-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    await wb.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Master Export ────────────────────────────────────────────────────────────

router.get('/export-master', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { name: true, code: true, reportBranchId: true } },
        items: { include: { item: { select: { sku: true, barcode: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StockCutoff';
    const ws = wb.addWorksheet('Sales Master');

    ws.columns = [
      { header: 'Branch Name', key: 'branchName', width: 24 },
      { header: 'Branch ID (Report)', key: 'reportBranchId', width: 22 },
      { header: 'Item SKU', key: 'sku', width: 16 },
      { header: 'Barcode', key: 'barcode', width: 20 },
      { header: 'Item Name', key: 'itemName', width: 32 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Price', key: 'price', width: 14 },
      { header: 'Subtotal', key: 'subtotal', width: 14 },
      { header: 'Sale Date', key: 'saleDate', width: 18 },
      { header: 'Source', key: 'source', width: 10 },
      { header: 'Bill Number', key: 'billNumber', width: 22 },
    ];

    bills.forEach((b) => {
      const saleDate = b.saleDate || b.createdAt;
      b.items.forEach((bi) => {
        ws.addRow({
          branchName: b.branch.name,
          reportBranchId: b.branch.reportBranchId || '',
          sku: bi.item.sku,
          barcode: bi.item.barcode,
          itemName: bi.item.name,
          qty: bi.quantity,
          price: Number(bi.price),
          subtotal: Number(bi.subtotal),
          saleDate: saleDate.toISOString().split('T')[0],
          source: b.source,
          billNumber: b.billNumber,
        });
      });
    });

    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const filename = `master-export-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Export BigSeller ─────────────────────────────────────────────────────────

router.get('/export-bigseller', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { name: true } },
        items: { include: { item: { select: { barcode: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const templatePath = path.join(process.cwd(), 'templates', 'bigseller_template.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);
    const ws = wb.worksheets[0]; // First sheet is the target

    // Data rows — one row per bill item (starts appending after existing header rows)
    for (const b of bills) {
      const saleDate = b.saleDate || b.createdAt;
      const dateStr = saleDate.toISOString().replace('T', ' ').slice(0, 16).replace(/-/g, '/');
      const branchLabel = b.branch.name;

      for (const bi of b.items) {
        const rowData = new Array(34).fill(null);
        rowData[0]  = branchLabel;     // A: ร้านค้า
        rowData[1]  = b.billNumber;    // B: หมายเลขคำสั่งซื้อ
        rowData[2]  = dateStr;         // C: เวลาสั่งซื้อ
        rowData[4]  = branchLabel;     // E: คลังสินค้าจัดส่ง
        rowData[5]  = branchLabel;     // F: ชื่อผู้รับ
        rowData[26] = bi.item.barcode; // AA: SKU ร้านค้า
        rowData[27] = 'THB';           // AB: สกุลเงิน
        rowData[28] = Number(bi.price);// AC: หน่วยราคา
        rowData[29] = bi.quantity;     // AD: จำนวน
        
        const excelRow = ws.addRow(rowData);
        excelRow.height = 12.75;
        for (let col = 1; col <= 34; col++) {
          excelRow.getCell(col).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
      }
    }

    const filename = `bigseller-import-${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Import Drafts ────────────────────────────────────────────────────────────

router.get("/import/drafts", authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const drafts = await prisma.importDraft.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' }
    });
    const summary = drafts.map(d => ({
      id: d.id, platform: d.platform, fileName: d.fileName, createdAt: d.createdAt, updatedAt: d.updatedAt
    }));
    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/import/draft', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { platform, fileName, rows } = req.body;
    let draftId = req.body.draftId;

    if (draftId) {
      await prisma.importDraft.update({
        where: { id: draftId },
        data: { rowsData: rows, updatedAt: new Date() }
      });
    } else {
      const draft = await prisma.importDraft.create({
        data: { userId: req.user!.id, platform, fileName, rowsData: rows }
      });
      draftId = draft.id;
    }
    res.json({ success: true, draftId });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

router.post('/import/draft/:id/resume', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const draft = await prisma.importDraft.findUnique({ where: { id: req.params.id } });
    if (!draft) return res.status(404).json({ error: 'Not found' });

    // We treat the saved rows as raw input lines mapped by old mapping, but we re-map them entirely!
    const result = await remapImportRows(draft.rowsData as any[], MAX_IMPORT_ROWS);

    res.json({
      draftId: draft.id,
      platform: draft.platform,
      fileName: draft.fileName,
      ...result
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to resume draft' });
  }
});

router.delete('/import/draft/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.importDraft.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/import/match', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const result = await remapImportRows([req.body], 1);
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Mapping lookup failed' });
  }
});

// ─── Unresolved Sales ────────────────────────────────────────────────────────

router.get('/unresolved-sales', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.unresolvedSale.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/unresolved-sales/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.unresolvedSale.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/unresolved-sales/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rawBranch, rawItem } = req.body;
    await prisma.unresolvedSale.update({
      where: { id: req.params.id },
      data: {
        rawBranch: rawBranch !== undefined ? String(rawBranch) : undefined,
        rawItem: rawItem !== undefined ? String(rawItem) : undefined
      }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.post('/unresolved-sales/auto-match', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.unresolvedSale.findMany({ where: { status: 'PENDING' } });
    if (records.length === 0) return res.json([]);

    // Format for our matcher
    const inputRows = records.map(r => ({
      rowNum: r.id as any,
      rawDate: r.rawDate,
      saleDate: r.saleDate,
      rawBranch: r.rawBranch,
      rawItem: r.rawItem,
      qty: r.qty,
      price: Number(r.price)
    }));

    const result = await remapImportRows(inputRows, 10000);

    // Attach match info back to the unresolved sale record
    const remapped = records.map(r => {
      const match = result.rows.find(x => x.rowNum === r.id);
      return { ...r, match };
    });

    res.json(remapped);
  } catch (e) {
    res.status(500).json({ error: 'Failed to auto-match' });
  }
});

router.post('/unresolved-sales/resolve', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { resolves } = req.body; // Array of { id, branchId, itemId }
    if (!resolves || !Array.isArray(resolves)) return res.status(400).json({ error: 'Invalid payload' });

    let importedCount = 0;

    for (const r of resolves) {
      const record = await prisma.unresolvedSale.findUnique({ where: { id: r.id } });
      if (!record || record.status !== 'PENDING') continue;

      const branch = await prisma.branch.findUnique({ where: { id: r.branchId } });
      const item = await prisma.item.findUnique({ where: { id: r.itemId } });
      if (!branch || !item) continue;

      const dateStr = record.saleDate || new Date().toISOString().split('T')[0];
      const parsedDate = new Date(dateStr);
      parsedDate.setUTCHours(0,0,0,0);

      const billNumber = generateImportBillNumber(parsedDate);
      const totalString = (record.qty * Number(record.price)).toFixed(2);

      await prisma.bill.create({
        data: {
          billNumber,
          branchId: branch.id,
          userId: req.user!.id,
          status: 'SUBMITTED',
          source: 'IMPORT',
          saleDate: parsedDate,
          subtotal: totalString,
          discount: '0',
          total: totalString,
          notes: `Import Platform: ${record.platform} | UnresolvedSale ID: ${record.id}`,
          importPlatform: record.platform,
          submittedAt: new Date(),
          items: {
            create: {
              itemId: item.id,
              quantity: record.qty,
              price: record.price,
              discount: '0',
              subtotal: totalString
            }
          }
        }
      });

      await prisma.item.update({
        where: { id: item.id },
        data: { saleDate: parsedDate },
      });

      await prisma.unresolvedSale.update({
        where: { id: record.id },
        data: { status: 'RESOLVED' }
      });
      importedCount++;
    }

    res.json({ success: true, imported: importedCount });
  } catch (e) {
    res.status(500).json({ error: 'Failed to resolve sales' });
  }
});

// ─── Import Preview ──────────────────────────────────────────────────────────

router.post('/import/preview', authenticate, requireSuperAdmin, importUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาอัพโหลดไฟล์ Excel' });
    const { platform } = req.body;
    if (!platform || !['CENTRAL', 'MBK', 'PLAYHOUSE'].includes(platform)) {
      return res.status(400).json({ error: 'กรุณาเลือกแพลตฟอร์ม' });
    }

    const parsedRows = await parseExcelData(req.file.buffer, platform as ImportPlatform);
    const result = await remapImportRows(parsedRows, MAX_IMPORT_ROWS);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'ประมวลผลไฟล์ไม่สำเร็จ: ' + (e as Error).message });
  }
});

// ─── Import Submit ────────────────────────────────────────────────────────────

router.post('/import/submit', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows, platform, unmatchedRows, fileName, draftId, force } = req.body as {
      rows: Array<{
        saleDate: string;
        branchId: string;
        itemId: string;
        qty: number;
        price: number;
        discount?: number; // Total row discount (may be absent for drafts without discount data)
      }>;
      platform: ImportPlatform;
      unmatchedRows?: any[];
      fileName?: string;
      draftId?: string;
      force?: boolean;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      if (!unmatchedRows || unmatchedRows.length === 0) {
        return res.status(400).json({ error: 'ไม่มีข้อมูลนำเข้า' });
      }
    }
    if (rows && rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `ข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งนำเข้าทีละส่วน` });
    }

    // ── Duplicate detection (unless force=true) ───────────────────────────────
    if (!force && rows && rows.length > 0) {
      const saleDates = [...new Set(rows.map(r => r.saleDate))]; // e.g. ["2026-01-15"]
      const branchIds = [...new Set(rows.map(r => r.branchId).filter(Boolean))];
      // Use day-range OR clauses to avoid exact-timestamp mismatch
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
        const conflicts = existingBills.map(b => ({
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

    // Validate that all referenced branchIds and itemIds exist in DB
    const uniqueBranchIds = [...new Set(rows.map((r) => r.branchId).filter(Boolean))];
    const uniqueItemIds = [...new Set(rows.map((r) => r.itemId).filter(Boolean))];

    const [validBranches, validItems] = await Promise.all([
      prisma.branch.findMany({ where: { id: { in: uniqueBranchIds } }, select: { id: true } }),
      prisma.item.findMany({ where: { id: { in: uniqueItemIds } }, select: { id: true } }),
    ]);

    const validBranchSet = new Set(validBranches.map((b) => b.id));
    const validItemSet = new Set(validItems.map((i) => i.id));
    const invalidRows = rows.filter((r) => !validBranchSet.has(r.branchId) || !validItemSet.has(r.itemId));
    if (invalidRows.length > 0) {
      return res.status(400).json({ error: `พบข้อมูลอ้างอิงไม่ถูกต้อง ${invalidRows.length} แถว กรุณา preview ใหม่` });
    }

    // Group rows by saleDate + branchId → one Bill per group
    const groups = new Map<string, { saleDate: Date; branchId: string; items: typeof rows }>();
    for (const row of rows) {
      const key = `${row.saleDate}|${row.branchId}`;
      if (!groups.has(key)) {
        groups.set(key, { saleDate: new Date(row.saleDate), branchId: row.branchId, items: [] });
      }
      groups.get(key)!.items.push(row);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    let createdCount = 0;
    const now = new Date();

    for (const [, group] of groups) {
      // Compute per-item net subtotals (gross - item discount)
      const billItems = group.items.map((r) => {
        const rowDiscount = round2(Math.max(0, Number(r.discount) || 0));
        const rowGross = round2(r.price * r.qty);
        const rowNet = round2(rowGross - rowDiscount);
        return { itemId: r.itemId, quantity: r.qty, price: r.price, discount: rowDiscount, subtotal: rowNet };
      });

      const billGross = round2(billItems.reduce((s, bi) => s + bi.price * bi.quantity, 0));
      const billDiscount = round2(billItems.reduce((s, bi) => s + bi.discount, 0));
      const billNet = round2(billItems.reduce((s, bi) => s + bi.subtotal, 0));

      // Validation: subtotal - discount must equal net total
      const expectedNet = round2(billGross - billDiscount);
      if (Math.abs(expectedNet - billNet) > 0.01) {
        console.warn(`[IMPORT VALIDATION] Discrepancy detected for ${group.branchId} on ${group.saleDate}: gross=฿${billGross}, discount=฿${billDiscount}, computed net=฿${billNet}, expected net=฿${expectedNet}`);
      }
      if (billDiscount > 0) {
        console.log(`[IMPORT] Discount applied: gross=฿${billGross}, discount=฿${billDiscount}, net=฿${billNet} (branch=${group.branchId}, date=${group.saleDate})`);
      }

      await prisma.bill.create({
        data: {
          billNumber: generateImportBillNumber(group.saleDate),
          branchId: group.branchId,
          userId: req.user!.id,
          status: 'SUBMITTED',
          source: 'IMPORT',
          importPlatform: platform || null,
          saleDate: group.saleDate,
          subtotal: billNet,   // Net (after discounts) — consistent with how POS bills store subtotal
          discount: 0,         // No bill-level discount for imports
          total: billNet,
          submittedAt: now,
          notes: fileName ? `นำเข้าจากไฟล์: ${fileName}` : 'นำเข้าจากไฟล์ Excel',
          items: {
            create: billItems,
          },
        },
      });

      await Promise.all(
        group.items.map((r) =>
          prisma.item.update({
            where: { id: r.itemId },
            data: { saleDate: group.saleDate },
          })
        )
      );

      createdCount++;
    }

    if (unmatchedRows && unmatchedRows.length > 0) {
      await prisma.unresolvedSale.createMany({
        data: unmatchedRows.map((r: any) => ({
          userId: req.user!.id,
          platform: String(platform),
          fileName: fileName || 'Unknown File',
          saleDate: r.saleDate?.toString() || null,
          rawDate: r.rawDate?.toString() || null,
          rawBranch: r.rawBranch?.toString() || null,
          rawItem: r.rawItem?.toString() || null,
          qty: Number(r.qty) || 0,
          price: Number(r.price) || 0,
          errors: r.errors || [],
          status: 'PENDING'
        }))
      });
    }

    // Auto-delete draft after successful submit
    if (draftId) {
      await prisma.importDraft.deleteMany({ where: { id: draftId } });
    }

    res.json({
      message: `นำเข้าสำเร็จ: ${rows?.length || 0} รายการ (${createdCount} บิล)${unmatchedRows?.length ? ` (และมียอดตกหล่น ${unmatchedRows.length} รายการรอจัดการทีหลัง)` : ''}`,
      billsCreated: createdCount,
      rowsImported: rows?.length || 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ' });
  }
});

export default router;
