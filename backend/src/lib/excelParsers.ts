import ExcelJS from 'exceljs';

export type ImportPlatform = 'CENTRAL' | 'MBK' | 'PLAYHOUSE';

export interface ParsedRow {
  rowNum: number;
  rawDate: string;
  saleDate: Date | null;
  rawBranch: string;
  rawItem: string;
  qty: number;
  price: number; // Unit price (derived from total amount / qty if needed)
}

/** Parse a cell value from ExcelJS into a JS Date */
export function parseExcelDate(value: any): Date | null {
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

export function cellStr(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((r: any) => r.text).join('');
  }
  return String(value).trim();
}

function findColIdx(headers: string[], possibleNames: string[]): number {
  return headers.findIndex((h) => possibleNames.some(p => h && h.toLowerCase().includes(p.toLowerCase())));
}

export async function parseExcelData(buffer: Buffer, platform: ImportPlatform): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('ไม่พบชีตในไฟล์ Excel');

  const rows: ParsedRow[] = [];
  
  let headerRowIdx = 1;
  if (platform === 'PLAYHOUSE') headerRowIdx = 2;
  if (platform === 'CENTRAL') headerRowIdx = 3;

  const headers: string[] = [];
  ws.getRow(headerRowIdx).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = cellStr(cell.value);
  });

  // Expected column matching depending on platform
  let dateCol = -1, branchCol = -1, itemCol = -1, qtyCol = -1, totalCol = -1;

  if (platform === 'PLAYHOUSE') {
    dateCol = findColIdx(headers, ['date', 'วันที่']);
    branchCol = findColIdx(headers, ['branch', 'สาขา']);
    itemCol = findColIdx(headers, ['sku', 'item']);
    qtyCol = findColIdx(headers, ['sales quantity', 'quantity', 'จำนวน']);
    totalCol = findColIdx(headers, ['net sales', 'total', 'ยอดสุทธิ']);
  } else if (platform === 'MBK') {
    dateCol = findColIdx(headers, ['trans date', 'date']);
    branchCol = findColIdx(headers, ['store name', 'branch']);
    // MBK usually matches by barcode
    itemCol = findColIdx(headers, ['barcode', 'item code']); 
    qtyCol = findColIdx(headers, ['quantity', 'qty']);
    totalCol = findColIdx(headers, ['net sale', 'sales amt', 'amount']);
  } else if (platform === 'CENTRAL') {
    dateCol = findColIdx(headers, ['sales date', 'date']);
    branchCol = findColIdx(headers, ['store number', 'store name']);
    itemCol = findColIdx(headers, ['barcode', 'sku']);
    qtyCol = findColIdx(headers, ['sales quantity', 'qty']);
    totalCol = findColIdx(headers, ['total net sales', 'net sales']);
  }

  // Fallbacks if headers are slightly different
  if (qtyCol === -1) qtyCol = findColIdx(headers, ['qty']);
  if (totalCol === -1) totalCol = findColIdx(headers, ['price', 'amt']);

  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRowIdx) return; // skip headers

    const getCellVal = (colIndex: number) => colIndex >= 0 ? row.getCell(colIndex + 1).value : null;

    const rawDateVal = getCellVal(dateCol);
    const rawBranch = cellStr(getCellVal(branchCol));
    const rawItem = cellStr(getCellVal(itemCol));
    const rawQtyVal = getCellVal(qtyCol);
    const rawTotalVal = getCellVal(totalCol);

    // Skip empty summary lines (must have at least date, branch, or item)
    if (!rawBranch && !rawItem && !rawDateVal) return;

    const saleDate = parseExcelDate(rawDateVal);
    const qty = parseFloat(cellStr(rawQtyVal)) || 0;
    const totalAmount = parseFloat(cellStr(rawTotalVal)) || 0;
    const price = qty > 0 ? totalAmount / qty : 0; // Derive unit price

    rows.push({
      rowNum,
      rawDate: cellStr(rawDateVal),
      saleDate,
      rawBranch,
      rawItem,
      qty,
      price,
    });
  });

  return rows;
}
