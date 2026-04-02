import { Router } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();

// Thai timezone day boundaries for a YYYY-MM-DD string
const thaiDayBounds = (dateStr: string) => ({
  start: new Date(`${dateStr}T00:00:00+07:00`),
  end:   new Date(`${dateStr}T23:59:59.999+07:00`),
});

// Convert any UTC Date to its Thai-timezone YYYY-MM-DD string
const toThaiDateStr = (date: Date): string => {
  const thaiDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return thaiDate.toISOString().split('T')[0];
};

// ─── Monthly Summary ─────────────────────────────────────────────────────────
// GET /api/calendar/monthly-summary?year=2024&month=1
router.get('/monthly-summary', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const year  = parseInt(req.query.year  as string);
    const month = parseInt(req.query.month as string); // 1–12

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`);
    const monthEnd   = month === 12
      ? new Date(`${year + 1}-01-01T00:00:00+07:00`)
      : new Date(`${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+07:00`);

    // All branches that could have been active during this month
    const branchIdFilter = req.user!.role === 'BRANCH_ADMIN' && req.user!.branchId
      ? { id: req.user!.branchId }
      : {};
    const branches = await prisma.branch.findMany({
      where: {
        ...branchIdFilter,
        createdAt: { lt: monthEnd },
        OR: [
          { deletedAt: null },
          { deletedAt: { gt: monthStart } },
        ],
      },
      select: { id: true, createdAt: true, deletedAt: true },
    });

    // All SUBMITTED bills in this month (effective date = saleDate ?? createdAt)
    const bills = await prisma.bill.findMany({
      where: {
        status: 'SUBMITTED',
        OR: [
          { saleDate: null, createdAt: { gte: monthStart, lt: monthEnd } },
          { saleDate: { gte: monthStart, lt: monthEnd } },
        ],
      },
      select: { branchId: true, saleDate: true, createdAt: true, total: true },
    });

    // Map: dateStr → Map<branchId, totalRevenue>
    const submissionsByDate = new Map<string, Map<string, number>>();
    for (const bill of bills) {
      const dateStr = toThaiDateStr(bill.saleDate ?? bill.createdAt);
      if (!submissionsByDate.has(dateStr)) submissionsByDate.set(dateStr, new Map());
      const byBranch = submissionsByDate.get(dateStr)!;
      byBranch.set(bill.branchId, (byBranch.get(bill.branchId) ?? 0) + Number(bill.total));
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day     = i + 1;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const { start: dayStart, end: dayEnd } = thaiDayBounds(dateStr);

      const activeBranches = branches.filter(
        b => b.createdAt <= dayEnd && (b.deletedAt === null || b.deletedAt > dayStart),
      );

      const branchSubs    = submissionsByDate.get(dateStr);
      const submittedCount = branchSubs
        ? activeBranches.filter(b => branchSubs.has(b.id)).length
        : 0;
      const totalRevenue = branchSubs
        ? Array.from(branchSubs.values()).reduce((s, v) => s + v, 0)
        : 0;

      return {
        date:              dateStr,
        activeBranches:    activeBranches.length,
        submittedBranches: submittedCount,
        percentage:        activeBranches.length > 0
          ? Math.round((submittedCount / activeBranches.length) * 100)
          : null,
        totalRevenue,
      };
    });

    res.json({ year, month, days });
  } catch (err) {
    console.error('[calendar] monthly-summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Day Detail ───────────────────────────────────────────────────────────────
// GET /api/calendar/day-detail?date=2024-01-15
router.get('/day-detail', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const dateStr = req.query.date as string;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }

    const { start: dayStart, end: dayEnd } = thaiDayBounds(dateStr);

    // Branches that existed and were not yet deleted on this day
    const branches = await prisma.branch.findMany({
      where: {
        createdAt: { lte: dayEnd },
        OR: [
          { deletedAt: null },
          { deletedAt: { gt: dayStart } },
        ],
      },
      select: { id: true, name: true, code: true, active: true, deletedAt: true },
      orderBy: { name: 'asc' },
    });

    // SUBMITTED bills for this day
    const bills = await prisma.bill.findMany({
      where: {
        status: 'SUBMITTED',
        OR: [
          { saleDate: null, createdAt: { gte: dayStart, lte: dayEnd } },
          { saleDate: { gte: dayStart, lte: dayEnd } },
        ],
      },
      select: { branchId: true, total: true },
    });

    // Aggregate by branch
    const billsByBranch = new Map<string, { total: number; count: number }>();
    for (const bill of bills) {
      const agg = billsByBranch.get(bill.branchId);
      if (agg) { agg.total += Number(bill.total); agg.count += 1; }
      else billsByBranch.set(bill.branchId, { total: Number(bill.total), count: 1 });
    }

    const result = branches
      .map(b => {
        const sub = billsByBranch.get(b.id);
        return {
          id:               b.id,
          name:             b.name,
          code:             b.code,
          submitted:        !!sub,
          totalAmount:      sub?.total ?? 0,
          billCount:        sub?.count ?? 0,
          currentlyActive:  b.active,
          currentlyDeleted: b.deletedAt !== null,
        };
      })
      // Submitted branches first, then alphabetical
      .sort((a, b) => {
        if (a.submitted !== b.submitted) return a.submitted ? -1 : 1;
        return a.name.localeCompare(b.name, 'th');
      });

    res.json({ date: dateStr, branches: result });
  } catch (err) {
    console.error('[calendar] day-detail error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── HR Export ────────────────────────────────────────────────────────────────
// GET /api/calendar/export?year=2024&month=1
router.get('/export', authenticate, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const year  = parseInt(req.query.year  as string);
    const month = parseInt(req.query.month as string);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`);
    const monthEnd   = month === 12
      ? new Date(`${year + 1}-01-01T00:00:00+07:00`)
      : new Date(`${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+07:00`);

    const daysInMonth = new Date(year, month, 0).getDate();
    const dayStrs = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    });

    // Branches active during this month
    const exportBranchIdFilter = req.user!.role === 'BRANCH_ADMIN' && req.user!.branchId
      ? { id: req.user!.branchId }
      : {};
    const branches = await prisma.branch.findMany({
      where: {
        ...exportBranchIdFilter,
        createdAt: { lt: monthEnd },
        OR: [{ deletedAt: null }, { deletedAt: { gt: monthStart } }],
      },
      select: { id: true, name: true, code: true, createdAt: true, deletedAt: true },
      orderBy: { name: 'asc' },
    });

    // All SUBMITTED bills in this month
    const bills = await prisma.bill.findMany({
      where: {
        status: 'SUBMITTED',
        OR: [
          { saleDate: null, createdAt: { gte: monthStart, lt: monthEnd } },
          { saleDate: { gte: monthStart, lt: monthEnd } },
        ],
      },
      select: { branchId: true, saleDate: true, createdAt: true, total: true },
    });

    // Map: dateStr → Map<branchId, totalRevenue>
    const submissionsByDate = new Map<string, Map<string, number>>();
    for (const bill of bills) {
      const dateStr = toThaiDateStr(bill.saleDate ?? bill.createdAt);
      if (!submissionsByDate.has(dateStr)) submissionsByDate.set(dateStr, new Map());
      const byBranch = submissionsByDate.get(dateStr)!;
      byBranch.set(bill.branchId, (byBranch.get(bill.branchId) ?? 0) + Number(bill.total));
    }

    // Per-branch per-day activity map
    const isBranchActiveOnDay = (b: typeof branches[number], dateStr: string) => {
      const { start: dayStart, end: dayEnd } = thaiDayBounds(dateStr);
      return b.createdAt <= dayEnd && (b.deletedAt === null || b.deletedAt > dayStart);
    };

    // ── Build workbook ────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    const thaiMonthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const monthLabel = `${thaiMonthNames[month - 1]} ${year + 543}`;

    const HDR_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    const HDR_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    const BORDER: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
    const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle' };

    // ── Sheet 1: Branch Summary ───────────────────────────────────────────────
    const ws1 = wb.addWorksheet('สรุปรายสาขา');
    ws1.addRow([`รายงานการส่งยอดขายประจำเดือน ${monthLabel}`]);
    ws1.getCell('A1').font = { bold: true, size: 13 };
    ws1.addRow([]);

    const summaryHeaders = ['ลำดับ', 'ชื่อสาขา', 'รหัสสาขา', 'วันที่ active', 'ส่งยอดแล้ว (วัน)', 'ยังไม่ส่ง (วัน)', '% การส่ง', 'ยอดรวม (฿)'];
    const hdrRow1 = ws1.addRow(summaryHeaders);
    hdrRow1.eachCell(c => { c.fill = HDR_FILL; c.font = HDR_FONT; c.border = BORDER; c.alignment = centerAlign; });
    ws1.getColumn(1).width = 8;
    ws1.getColumn(2).width = 30;
    ws1.getColumn(3).width = 14;
    ws1.getColumn(4).width = 14;
    ws1.getColumn(5).width = 18;
    ws1.getColumn(6).width = 16;
    ws1.getColumn(7).width = 12;
    ws1.getColumn(8).width = 18;

    let grandTotal = 0;
    branches.forEach((b, idx) => {
      let activeDays = 0, submittedDays = 0, totalRevenue = 0;
      dayStrs.forEach(dateStr => {
        if (!isBranchActiveOnDay(b, dateStr)) return;
        activeDays++;
        const dayMap = submissionsByDate.get(dateStr);
        if (dayMap?.has(b.id)) { submittedDays++; totalRevenue += dayMap.get(b.id)!; }
      });
      const pct = activeDays > 0 ? Math.round((submittedDays / activeDays) * 100) : 0;
      grandTotal += totalRevenue;

      const row = ws1.addRow([idx + 1, b.name, b.code, activeDays, submittedDays, activeDays - submittedDays, `${pct}%`, totalRevenue]);
      row.eachCell(c => { c.border = BORDER; c.alignment = { vertical: 'middle' }; });
      row.getCell(1).alignment = centerAlign;
      row.getCell(4).alignment = centerAlign;
      row.getCell(5).alignment = centerAlign;
      row.getCell(6).alignment = centerAlign;
      row.getCell(7).alignment = centerAlign;
      row.getCell(8).numFmt = '#,##0.00';
      // Colour % cell
      const pctCell = row.getCell(7);
      if (pct >= 95)      pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      else if (pct >= 80) pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
      else if (pct >= 60) pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7AA' } };
      else if (activeDays > 0) pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
    });

    // Grand total row
    const totalRow = ws1.addRow(['', 'รวมทั้งหมด', '', '', '', '', '', grandTotal]);
    totalRow.eachCell(c => { c.border = BORDER; c.font = { bold: true }; });
    totalRow.getCell(8).numFmt = '#,##0.00';

    // ── Sheet 2: Daily Grid ───────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('รายละเอียดรายวัน');
    ws2.addRow([`รายละเอียดการส่งยอดรายวัน — ${monthLabel}`]);
    ws2.getCell('A1').font = { bold: true, size: 13 };
    ws2.addRow([]);

    // Header row: ชื่อสาขา | รหัส | 1 | 2 | ... | 31 | รวมยอด
    const gridHeaders = ['ชื่อสาขา', 'รหัส', ...dayStrs.map(d => String(parseInt(d.split('-')[2]))), 'รวมยอด (฿)'];
    const gridHdrRow = ws2.addRow(gridHeaders);
    gridHdrRow.eachCell(c => { c.fill = HDR_FILL; c.font = HDR_FONT; c.border = BORDER; c.alignment = centerAlign; });
    ws2.getColumn(1).width = 28;
    ws2.getColumn(2).width = 12;
    dayStrs.forEach((_, i) => { ws2.getColumn(i + 3).width = 5; });
    ws2.getColumn(dayStrs.length + 3).width = 16;

    branches.forEach(b => {
      let rowTotal = 0;
      const cells: (string | number)[] = [b.name, b.code];
      dayStrs.forEach(dateStr => {
        if (!isBranchActiveOnDay(b, dateStr)) { cells.push(''); return; }
        const dayMap = submissionsByDate.get(dateStr);
        if (dayMap?.has(b.id)) { rowTotal += dayMap.get(b.id)!; cells.push('✓'); }
        else cells.push('—');
      });
      cells.push(rowTotal);
      const row = ws2.addRow(cells);
      row.eachCell(c => { c.border = BORDER; c.alignment = { vertical: 'middle', horizontal: 'center' }; });
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
      const lastCol = dayStrs.length + 3;
      row.getCell(lastCol).numFmt = '#,##0.00';

      // Colour daily cells
      dayStrs.forEach((dateStr, i) => {
        if (!isBranchActiveOnDay(b, dateStr)) return;
        const cell = row.getCell(i + 3);
        const dayMap = submissionsByDate.get(dateStr);
        if (dayMap?.has(b.id)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
          cell.font = { color: { argb: 'FF065F46' }, bold: true };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFECACA' } };
          cell.font = { color: { argb: 'FF991B1B' } };
        }
      });
    });

    // Send file
    const thaiMonthAbbr = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const filename = encodeURIComponent(`รายงานการส่งยอด-${thaiMonthAbbr[month - 1]}-${year + 543}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[calendar] export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
