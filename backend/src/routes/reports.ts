import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    // Excel serial date (days since 1900-01-01, with leap year bug)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim()) {
    // Try ISO / standard parse
    let d = new Date(value.trim());
    if (!isNaN(d.getTime())) return d;
    // DD/MM/YYYY or DD-MM-YYYY
    const m = value.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const year = parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
      d = new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  // ExcelJS rich-text object
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

// ─── Dashboard ──────────────────────────────────────────────────────────────

router.get('/dashboard', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const bw = branchFilter(req);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const todayBills = await prisma.bill.findMany({
      where: { ...bw, status: 'SUBMITTED', createdAt: { gte: today, lt: tomorrow } },
      include: { items: true },
    });
    const todayRevenue = todayBills.reduce((s, b) => s + Number(b.total), 0);
    const todayItemsSold = todayBills.reduce((s, b) => s + b.items.reduce((si, i) => si + i.quantity, 0), 0);

    const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const recentBills = await prisma.bill.findMany({
      where: { ...bw, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
    });
    const dayMap: Record<string, { revenue: number; bills: number }> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo); d.setDate(d.getDate() + i);
      dayMap[d.toISOString().split('T')[0]] = { revenue: 0, bills: 0 };
    }
    for (const b of recentBills) {
      const key = b.createdAt.toISOString().split('T')[0];
      if (dayMap[key]) { dayMap[key].revenue += Number(b.total); dayMap[key].bills++; }
    }
    const revenueByDay = Object.entries(dayMap).map(([date, v]) => ({ date, ...v }));

    const allBillsForItems = await prisma.bill.findMany({
      where: { ...bw, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
      include: { items: { include: { item: { select: { name: true, sku: true } } } } },
    });
    const itemMap: Record<string, { name: string; sku: string; qty: number; revenue: number }> = {};
    for (const b of allBillsForItems) {
      for (const bi of b.items) {
        if (!itemMap[bi.itemId]) itemMap[bi.itemId] = { name: bi.item.name, sku: bi.item.sku, qty: 0, revenue: 0 };
        itemMap[bi.itemId].qty += bi.quantity;
        itemMap[bi.itemId].revenue += Number(bi.subtotal);
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    let branchSales: any[] = [];
    if (req.user!.role === 'SUPER_ADMIN') {
      const branches = await prisma.branch.findMany({ where: { active: true } });
      for (const br of branches) {
        const agg = await prisma.bill.aggregate({
          where: { branchId: br.id, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
          _sum: { total: true }, _count: true,
        });
        branchSales.push({ branch: br.name, revenue: Number(agg._sum.total || 0), bills: agg._count });
      }
    }
    res.json({ todayRevenue, todayBills: todayBills.length, todayItemsSold, revenueByDay, topItems, branchSales });
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
        branch: { select: { name: true, bigsellerBranchId: true } },
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
      { header: 'Bigseller Branch ID', key: 'bigsellerBranchId', width: 22 },
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
        bigsellerBranchId: b.branch.bigsellerBranchId || '',
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

// ─── Master Export (unified template) ────────────────────────────────────────
// Columns: branch name, Bigseller Branch ID, item SKU, barcode, qty, price, sale date

router.get('/export-master', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { name: true, code: true, bigsellerBranchId: true, reportBranchId: true } },
        items: { include: { item: { select: { sku: true, barcode: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StockCutoff';
    const ws = wb.addWorksheet('Sales Master');

    ws.columns = [
      { header: 'Branch Name', key: 'branchName', width: 24 },
      { header: 'Branch ID (Bigseller)', key: 'bigsellerBranchId', width: 24 },
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
          bigsellerBranchId: b.branch.bigsellerBranchId || '',
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

    ws.getRow(1).font = { bold: true };
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

// ─── Import Preview ──────────────────────────────────────────────────────────

router.post('/import/preview', authenticate, requireAdmin, importUpload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'กรุณาอัพโหลดไฟล์ Excel' });
    const { templateId } = req.body;
    if (!templateId) return res.status(400).json({ error: 'กรุณาเลือกเทมเพลต' });

    const template = await prisma.reportTemplate.findUnique({ where: { id: templateId } });
    if (!template) return res.status(404).json({ error: 'ไม่พบเทมเพลต' });

    // Load all branches and items for matching
    const allBranches = await prisma.branch.findMany({ where: { active: true } });
    const allItems = await prisma.item.findMany({ where: { active: true } });

    // Parse Excel
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'ไม่พบชีตในไฟล์ Excel' });

    // Read headers from row 1
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
      headers[colNum - 1] = cellStr(cell.value);
    });

    const colIdx = (name: string | null): number =>
      name ? headers.indexOf(name) : -1;

    const dateCol = colIdx(template.columnDate);
    const barcodeCol = colIdx(template.columnBarcode);
    const skuCol = colIdx(template.columnSku);
    const priceCol = colIdx(template.columnPrice);
    const qtyCol = colIdx(template.columnQty);
    const branchIdCol = colIdx(template.columnBranchId);
    const branchNameCol = colIdx(template.columnBranchName);

    // Helper: find branch by configured field
    const findBranch = (branchValue: string) => {
      if (!branchValue) return null;
      const v = branchValue.trim();
      switch (template.branchMatchBy) {
        case 'name': return allBranches.find((b) => b.name === v) || null;
        case 'code': return allBranches.find((b) => b.code === v) || null;
        case 'reportBranchId': return allBranches.find((b) => b.reportBranchId === v) || null;
        case 'bigsellerBranchId': return allBranches.find((b) => b.bigsellerBranchId === v) || null;
        default: return allBranches.find((b) => b.name === v) || null;
      }
    };

    // Helper: find item
    const findItem = (itemValue: string) => {
      if (!itemValue) return null;
      const v = itemValue.trim();
      if (template.itemMatchBy === 'sku') return allItems.find((i) => i.sku === v) || null;
      return allItems.find((i) => i.barcode === v) || null;
    };

    const rows: any[] = [];
    let totalQty = 0;
    let totalRevenue = 0;
    let matched = 0;

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header

      const getCellVal = (colIndex: number) =>
        colIndex >= 0 ? row.getCell(colIndex + 1).value : null;

      // Get branch identifier
      const rawBranchId = branchIdCol >= 0 ? cellStr(getCellVal(branchIdCol)) : '';
      const rawBranchName = branchNameCol >= 0 ? cellStr(getCellVal(branchNameCol)) : '';
      const rawBranch = rawBranchId || rawBranchName;

      // Get item identifier
      const rawBarcodeVal = barcodeCol >= 0 ? cellStr(getCellVal(barcodeCol)) : '';
      const rawSkuVal = skuCol >= 0 ? cellStr(getCellVal(skuCol)) : '';
      const rawItem = template.itemMatchBy === 'sku' ? rawSkuVal : rawBarcodeVal;
      const rawItemFallback = rawBarcodeVal || rawSkuVal;

      const rawDateVal = dateCol >= 0 ? getCellVal(dateCol) : null;
      const rawPriceVal = getCellVal(priceCol);
      const rawQtyVal = getCellVal(qtyCol);

      // Skip completely empty rows
      if (!rawBranch && !rawItem && !rawDateVal && !rawPriceVal && !rawQtyVal) return;

      const saleDate = parseExcelDate(rawDateVal);
      const qty = parseFloat(cellStr(rawQtyVal)) || 0;
      const price = parseFloat(cellStr(rawPriceVal)) || 0;
      const errors: string[] = [];

      if (!saleDate) errors.push('วันที่ไม่ถูกต้อง');
      if (qty <= 0) errors.push('จำนวนต้องมากกว่า 0');
      if (price < 0) errors.push('ราคาไม่ถูกต้อง');

      const branch = findBranch(rawBranch);
      const item = findItem(rawItem || rawItemFallback);

      if (!branch && rawBranch) errors.push(`ไม่พบสาขา: ${rawBranch}`);
      if (!item && rawItem) errors.push(`ไม่พบสินค้า: ${rawItem || rawItemFallback}`);

      const isMatched = !!saleDate && !!branch && !!item && qty > 0 && price >= 0 && errors.length === 0;

      if (isMatched) {
        matched++;
        totalQty += qty;
        totalRevenue += qty * price;
      }

      rows.push({
        rowNum,
        rawDate: cellStr(rawDateVal),
        saleDate: saleDate ? saleDate.toISOString().split('T')[0] : null,
        rawBranch,
        branchId: branch?.id || null,
        branchName: branch?.name || rawBranch,
        rawItem: rawItem || rawItemFallback,
        itemId: item?.id || null,
        itemName: item?.name || '',
        itemSku: item?.sku || rawSkuVal,
        itemBarcode: item?.barcode || rawBarcodeVal,
        qty,
        price,
        status: isMatched ? 'matched' : errors.length ? 'invalid' : (!branch ? 'no_branch' : 'no_item'),
        errors,
      });
    });

    res.json({
      rows,
      stats: {
        total: rows.length,
        matched,
        unmatched: rows.length - matched,
        totalQty,
        totalRevenue,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'ประมวลผลไฟล์ไม่สำเร็จ' });
  }
});

// ─── Import Submit ────────────────────────────────────────────────────────────

router.post('/import/submit', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = req.body as {
      rows: Array<{
        saleDate: string;
        branchId: string;
        itemId: string;
        qty: number;
        price: number;
      }>;
    };

    if (!rows || rows.length === 0) return res.status(400).json({ error: 'ไม่มีข้อมูลนำเข้า' });

    // Group rows by saleDate + branchId → one Bill per group
    const groups = new Map<string, { saleDate: Date; branchId: string; items: typeof rows }>();
    for (const row of rows) {
      const key = `${row.saleDate}|${row.branchId}`;
      if (!groups.has(key)) {
        groups.set(key, { saleDate: new Date(row.saleDate), branchId: row.branchId, items: [] });
      }
      groups.get(key)!.items.push(row);
    }

    let createdCount = 0;
    const now = new Date();

    for (const [, group] of groups) {
      const subtotal = group.items.reduce((s, r) => s + r.price * r.qty, 0);
      await prisma.bill.create({
        data: {
          billNumber: generateImportBillNumber(group.saleDate),
          branchId: group.branchId,
          userId: req.user!.id,
          status: 'SUBMITTED',
          source: 'IMPORT',
          saleDate: group.saleDate,
          subtotal,
          discount: 0,
          total: subtotal,
          submittedAt: now,
          notes: 'นำเข้าจากไฟล์ Excel',
          items: {
            create: group.items.map((r) => ({
              itemId: r.itemId,
              quantity: r.qty,
              price: r.price,
              discount: 0,
              subtotal: r.price * r.qty,
            })),
          },
        },
      });
      createdCount++;
    }

    res.json({
      message: `นำเข้าสำเร็จ: ${rows.length} รายการ (${createdCount} บิล)`,
      billsCreated: createdCount,
      rowsImported: rows.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ' });
  }
});

export default router;
