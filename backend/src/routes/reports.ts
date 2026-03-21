import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

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

// ─── Dashboard ──────────────────────────────────────────────────────────────

router.get('/dashboard', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const bw = branchFilter(req);
    const { today, tomorrow } = getThaiDayRange();
    const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [todayBills, recentBills, allBillsForItems] = await Promise.all([
      prisma.bill.findMany({
        where: { ...bw, status: 'SUBMITTED', createdAt: { gte: today, lt: tomorrow } },
        include: { items: true },
      }),
      prisma.bill.findMany({
        where: { ...bw, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.bill.findMany({
        where: { ...bw, status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
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
      const key = new Date(b.createdAt.getTime() + THAI_OFFSET_MS).toISOString().split('T')[0];
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
        prisma.branch.findMany({ where: { active: true }, select: { id: true, name: true } }),
        prisma.bill.groupBy({
          by: ['branchId'],
          where: { status: 'SUBMITTED', createdAt: { gte: sevenDaysAgo } },
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

// ─── Master Export ────────────────────────────────────────────────────────────

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

const BIGSELLER_HEADER_ROW1 = [
  'ร้านค้า','หมายเลขคำสั่งซื้อ','เวลาสั่งซื้อ','โลจิสติกส์ที่ผู้ซื้อกำหนด','คลังสินค้าจัดส่ง',
  'ชื่อผู้รับ','เบอร์โทรศัพท์ผู้รับ','รหัสไปรษณีย์','รหัสประเทศ','ประเทศ/ภูมิภาคผู้รับ',
  'จังหวัดผู้รับ','อำเภอ/เขตผู้รับ','ตำบล/แขวงผู้รับ','รายละเอียดที่อยู่','ข้อความผู้ซื้อ',
  'วิธีชำระเงิน','วิธีการโอน','เงินมัดจำ','บัญชีการโอน','ผู้ขายจ่ายค่าจัดส่ง',
  'ส่วนลด','วิธีการจัดส่ง','หมายเลขแทร็คกิ้ง','ชื่อผู้รับ','เบอร์โทรศัพท์ผู้ส่ง',
  'ที่อยู่ผู้ส่ง','SKU ร้านค้า','สกุลเงิน','หน่วยราคา','จำนวน',
  'น้ำหนักต่อชิ้น','น้ำหนักพัสดุ','ผู้ซื้อจ่ายค่าจัดส่ง','เครื่องหมายคำสั่งซื้อ',
];

const BIGSELLER_HEADER_ROW2 = [
  'ไม่จำเป็นต้องกรอก','จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก',
  'จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก',
  'ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก',
  'ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','หากเลือกวิธีชำระเงินเป็น Depoist : จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก',
  'ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก',
  'ไม่จำเป็นต้องกรอก','จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','จำเป็นต้องกรอก','จำเป็นต้องกรอก',
  'ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก','ไม่จำเป็นต้องกรอก',
];

const BIGSELLER_HEADER_ROW3 = [
  'ชื่อเล่นร้านค้าของคำสั่งซื้อ','โปรดทราบว่าหมายเลขคำสั่งซื้อต้องไม่เหมือนกับหมายเลขคำสั่งซื้อที่มีอยู่แล้วในระบบ BigSeller','เวลาสั่งซื้อของคำสั่งซื้อ','ชื่อโลจิสติกส์ที่ผู้ซื้อกำหนด','หมายถึงชื่อคลังสินค้าที่คุณจัดส่งสินค้า ปัจจุบันรองรับหมายเลขคำสั่งซื้อเดียวมีคลังสินค้าจัดส่งเดียวเท่านั้น โปรดตรวจสอบให้แน่ใจว่าบัญชีของคุณมีสิทธิ์ของคลังสินค้านี้',
  'ชื่อผู้รับของคำสั่งซื้อ','เบอร์โทรศัพท์ผู้รับของคำสั่งซื้อ','รหัสไปรษณีย์สำหรับที่อยู่ผู้รับของคำสั่งซื้อ','หมายถึงรหัสประเทศของผู้รับ หลังจากกรอกแล้ว ระบบจะแปลงเป็นตัวเลขตามรหัสประเทศและแสดงที่ข้างหน้าของเบอร์โทรศัพท์ผู้ซื้อ','ประเทศ/ภูมิภาคของผู้รับ',
  'จังหวัดของผู้รับ','อำเภอ/เขตของผู้รับ','ตำบล/แขวงของผู้รับ','รายละเอียดที่อยู่ของผู้รับในคำสั่งซื้อ','ข้อความผู้ซื้อสำหรับคำสั่งซื้อ คุณสามารถดูข้อความผู้ซื้อได้ที่เมนู "การจัดการคำสั่งซื้อ"',
  'หมายถึงวิธีการชำระเงินสำหรับคำสั่งซื้อ รองรับเฉพาะ Prepaid COD Transfer และ Deposit เท่านั้น','ใช้ได้เฉพาะกับวิธีชำระเงินเป็น Transfer หากวิธีชำระเงินเป็น Prepaid หรือ COD Deposit การนำเข้าจะไม่มีผล','วิธีชำระเงินเป็น Deposit  จำเป็นต้องกรอกคอลัมน์เงินมัดจำ\n','ใช้ได้เฉพาะกับวิธีชำระเงินเป็น Transfer หากวิธีชำระเงินเป็น Prepaid หรือ COD Deposit การนำเข้าจะไม่มีผล','ค่าจัดส่งที่ผู้ขายชำระสำหรับคำสั่งซื้อ',
  'ส่วนลดที่ผู้ขายมอบให้ของคำสั่งซื้อ','หมายถึงชื่อโลจิสติกส์ในคำสั่งซื้อ โปรดอย่ากรอกชื่อผู้ให้บริการโลจิสติกส์บุคคลที่สาม','หมายเลขแทร็คกิ้งของคำสั่งซื้อ','ชื่อผู้รับในคำสั่งซื้อ','เบอร์โทรศัพท์ผู้ส่งของคำสั่งซื้อ',
  'ที่อยู่ผู้ส่งของคำสั่งซื้อ','หากมี SKU หลายรายการในคำสั่งซื้อเดียวกัน โปรดกรอกหลายบรรทัด และข้อมูลอื่นๆ จะต้องสอดคล้องกับ SKU ในบรรทัดแรก ยกเว้น SKU ร้านค้า จำนวน และหน่วยราคา หากไม่สอดคล้องกัน จะอ้างอิงจากข้อมูลใน SKU ของบรรทัดแรก คำสั่งซื้อเดียวสามารถมี SKU Merchant ได้สูงสุด 100 รายการ','สกุลเงินของหมายเลขคำสั่งซื้อเดียวกันจะต้องสอดคล้องกัน หากไม่ได้เลือกสกุลเงิน ระบบจะจัดสกุลเงินตามตลาดการขายอัตโนมัติ','หน่วยราคาของ SKU ร้านค้านี้ในคำสั่งซื้อนี้','จำนวน SKU ร้านค้านี้ในคำสั่งซื้อนี้',
  'น้ำหนักต่อชิ้นของ SKU ร้านค้านี้ และหน่วยเป็นกรัม','น้ำหนักพัสดุของคำสั่งซื้อนี้ และหน่วยเป็นกรัม','ค่าจัดส่งที่ผู้ขายชำระสำหรับคำสั่งซื้อนี้','เครื่องหมายที่กรอกจะต้องเป็นเครื่องหมายที่มีอยู่และเปิดใช้งานในระบบแล้ว หากมีหลายเครื่องหมาย โปรดขึ้นบรรทัดใหม่',
];

const BIGSELLER_HEADER_ROW4 = [
  'ชื่อเล่นร้านค้าต้องมีอยู่แล้วใน BigSeller และอยู่ในสถานะเปิด','ไม่ควรยาวเกิน 100 ตัวอักษร และสามารถกรอกตัวเลข ตัวอักษร ขีดเส้นใต้_ ขีดเส้นกลาง— ได้เท่านั้น','รูปแบบ: yyyy/mm/dd hh:mm หรือ dd/mm/yyyy hh:mm','ไม่ควรยาวเกิน 100 ตัวอักษร และไม่จำกัดประเภทตัวอักษร','โปรดกรอกชื่อคลังสินค้าตามหน้าสินค้าคงคลัง > คลังสินค้า หากไม่ได้กรอกช่องนี้ ระบบจะใส่เป็นคลังสินค้าเริ่มต้น',
  'ไม่ควรยาวเกิน 100 ตัวอักษร','ไม่ควรยาวเกิน 13 ตัวอักษร','ไม่ควรยาวเกิน 6 ตัวอักษร','สามารถกรอกได้เฉพาะรหัสประเทศสองหลัก (เช่น ID, TH) เท่านั้น หากไม่กรอก รหัสประเทศจะว่างเปล่า','หากต้องการใช้โลจิสติกส์บุคคลที่สาม แนะนำให้กรอกข้อมูลนี้ และโปรดกรอกข้อมูลตามตารางที่อยู่ BigSeller อย่างเคร่งครัด การกรอกไม่ถูกต้องจะทำให้เกิดข้อผิดพลาดในการนำเข้าได้',
  'หากต้องการใช้โลจิสติกส์บุคคลที่สาม แนะนำให้กรอกข้อมูลนี้ และโปรดกรอกข้อมูลตามตารางที่อยู่ BigSeller อย่างเคร่งครัด การกรอกไม่ถูกต้องจะทำให้เกิดข้อผิดพลาดในการนำเข้าได้','หากต้องการใช้โลจิสติกส์บุคคลที่สาม แนะนำให้กรอกข้อมูลนี้ และโปรดกรอกข้อมูลตามตารางที่อยู่ BigSeller อย่างเคร่งครัด การกรอกไม่ถูกต้องจะทำให้เกิดข้อผิดพลาดในการนำเข้าได้','หากต้องการใช้โลจิสติกส์บุคคลที่สาม แนะนำให้กรอกข้อมูลนี้ และโปรดกรอกข้อมูลตามตารางที่อยู่ BigSeller อย่างเคร่งครัด การกรอกไม่ถูกต้องจะทำให้เกิดข้อผิดพลาดในการนำเข้าได้','ไม่ควรยาวเกิน 500 ตัวอักษร','ไม่ควรยาวเกิน 500 ตัวอักษร',
  'รองรับกรอกเฉพาะ Prepaid COD  Transfer และDeposit เท่านั้น หากเป็นค่าว่างเปล่า เมื่อนำเข้าจะใส่เป็น Prepaid เริ่มต้น','ไม่ควรยาวเกิน 100 ตัวอักษร','หากวิธีชำระเงินของคำสั่งซื้อเลือกเป็น Deposit：\n1.จำเป็นต้องกรอกเงินมัดจำ ไม่สามารถว่างเปล่า\n2.เงินมัดจำไม่สามารถเป็น 0。\n3.เงินมัดจำควรน้อยกว่ามูลค่าการสั่งซื้อ(มูลค่าการสั่งซื้อ = SKU ทั้งหมดในคำสั่งซื้อ * รวมราคาต่อหน่วย - ส่วนลดของคำสั่งซื้อ+ผู้ซื้อจ่ายค่าจัดส่ง）。\nหมายเหตุ: เงินมัดจำตามมิติคำสั่งซื้อ โดยหมายเลขคำสั่งซื้อหนึ่งหมายเลขจะตรงกับจำนวนเงินมัดจำหนึ่งจำนวน และจำนวนเงินมัดจำที่กรอกไว้สำหรับหมายเลขคำสั่งซื้อเดียวกันควรเหมือนกัน','ไม่ควรยาวเกิน 100 ตัวอักษร','ตัวเลขที่กรอกต้องไม่น้อยกว่า 0',
  'สามารถกรอกได้เฉพาะตัวเลขที่ไม่เป็นลบเท่านั้น และข้อมูลที่กรอกต้องไม่เกินผลรวมของราคารวมสินค้าและค่าจัดส่ง','ไม่ควรยาวเกิน 100 ตัวอักษร และไม่จำกัดประเภทตัวอักษร','ไม่ควรยาวเกิน 150 ตัวอักษร และสามารถกรอกตัวเลข ตัวอักษร ขีดเส้นใต้_ ขีดเส้นกลาง— ได้เท่านั้น','ไม่ควรยาวเกิน 200 ตัวอักษร','ไม่ควรยาวเกิน 13 ตัวอักษร',
  'ไม่ควรยาวเกิน 500 ตัวอักษร','ไม่ควรยาวเกิน 190 ตัวอักษร หากคุณใช้ฟีเจอร์สินค้าคงคลังของ BigSeller โปรดกรอก SKU ร้านค้าตามข้อมูลในหน้า [สินค้าคงคลัง-SKU Merchant] หากคุณไม่ได้ใช้ฟังก์ชันสินค้าคงคลังของ BigSeller คุณสามารถกรอกค่าตามความต้องการ','สกุลเงินรองรับการกรอก"USD""CNY""IDR""PHP""THB""SGD""VND""MYR""TWD" เท่านั้น','ตัวเลขที่กรอกต้องมากกว่าหรือเท่ากับ 0 และรองรับการกรอกทศนิยมสองตำแหน่ง','ตัวเลขที่กรอกต้องมากกว่า 0',
  'หากคุณต้องการใช้โลจิสติกส์บุคคลที่สาม ขอแนะนำให้กรอกหรือรักษาข้อมูลน้ำหนักของ SKU Merchant และตัวเลขที่กรอกต้องมากกว่า 0 และรองรับการกรอกทศนิยมสองตำแหน่ง','ตัวเลขที่กรอกต้องมากกว่า 0 และน้ำหนักพัสดุต้องไม่น้อยกว่าผลรวมของน้ำหนักต่อชิ้น และรองรับการกรอกทศนิยมสองตำแหน่ง','ตัวเลขที่กรอกต้องมากกว่า 0','สามารถเพิ่มเครื่องหมายได้สูงสุด 10 เครื่องหมายในแต่ละคำสั่งซื้อ',
];

router.get('/export-bigseller', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const where = buildWhere(req, req.query);
    const bills = await prisma.bill.findMany({
      where,
      include: {
        branch: { select: { name: true, bigsellerBranchId: true } },
        items: { include: { item: { select: { barcode: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'StockCutoff';
    const ws = wb.addWorksheet('Sheet2');

    // Set column widths to match 34 columns
    for (let i = 1; i <= 34; i++) ws.getColumn(i).width = 20;

    // Write the 4 fixed header rows exactly as the BigSeller template
    ws.addRow(BIGSELLER_HEADER_ROW1);
    ws.addRow(BIGSELLER_HEADER_ROW2);
    ws.addRow(BIGSELLER_HEADER_ROW3);
    ws.addRow(BIGSELLER_HEADER_ROW4);

    // Style header row 1 (bold)
    ws.getRow(1).font = { bold: true };

    // Data rows — one row per bill item
    for (const b of bills) {
      const saleDate = b.saleDate || b.createdAt;
      const dateStr = saleDate.toISOString().replace('T', ' ').slice(0, 16).replace(/-/g, '/');
      const branchLabel = b.branch.bigsellerBranchId || b.branch.name;

      for (const bi of b.items) {
        const row = new Array(34).fill(null);
        row[0]  = branchLabel;          // A: ร้านค้า
        row[1]  = b.billNumber;          // B: หมายเลขคำสั่งซื้อ
        row[2]  = dateStr;               // C: เวลาสั่งซื้อ
        row[4]  = branchLabel;           // E: คลังสินค้าจัดส่ง
        row[5]  = branchLabel;           // F: ชื่อผู้รับ
        row[26] = bi.item.barcode;       // AA: SKU ร้านค้า
        row[27] = 'THB';                 // AB: สกุลเงิน
        row[28] = Number(bi.price);      // AC: หน่วยราคา
        row[29] = bi.quantity;           // AD: จำนวน
        ws.addRow(row);
      }
    }

    const filename = `bigseller-import-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
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

    const allBranches = await prisma.branch.findMany({ where: { active: true } });
    const allItems = await prisma.item.findMany({ where: { active: true } });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) return res.status(400).json({ error: 'ไม่พบชีตในไฟล์ Excel' });

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
    let rowCount = 0;

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return; // skip header
      if (rowCount >= MAX_IMPORT_ROWS) return; // hard cap to prevent DoS
      rowCount++;

      const getCellVal = (colIndex: number) =>
        colIndex >= 0 ? row.getCell(colIndex + 1).value : null;

      const rawBranchId = branchIdCol >= 0 ? cellStr(getCellVal(branchIdCol)) : '';
      const rawBranchName = branchNameCol >= 0 ? cellStr(getCellVal(branchNameCol)) : '';
      const rawBranch = rawBranchId || rawBranchName;

      const rawBarcodeVal = barcodeCol >= 0 ? cellStr(getCellVal(barcodeCol)) : '';
      const rawSkuVal = skuCol >= 0 ? cellStr(getCellVal(skuCol)) : '';
      const rawItem = template.itemMatchBy === 'sku' ? rawSkuVal : rawBarcodeVal;
      const rawItemFallback = rawBarcodeVal || rawSkuVal;

      const rawDateVal = dateCol >= 0 ? getCellVal(dateCol) : null;
      const rawPriceVal = getCellVal(priceCol);
      const rawQtyVal = getCellVal(qtyCol);

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

    const truncated = rowCount >= MAX_IMPORT_ROWS;
    res.json({
      rows,
      stats: {
        total: rows.length,
        matched,
        unmatched: rows.length - matched,
        totalQty,
        totalRevenue,
        truncated,
        maxRows: MAX_IMPORT_ROWS,
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

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'ไม่มีข้อมูลนำเข้า' });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `ข้อมูลเกิน ${MAX_IMPORT_ROWS} แถว กรุณาแบ่งนำเข้าทีละส่วน` });
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
