import ExcelJS from 'exceljs';
import { cellStr } from './excelParsers';

export interface ParsedItemRow {
  rowNum: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  defaultPrice: number | string;
  category: string;
  status: 'new' | 'update' | 'invalid';
  errors: string[];
}

function findColIdx(headers: string[], possibleNames: string[]): number {
  return headers.findIndex((h) => possibleNames.some((p) => h && h.toLowerCase().includes(p.toLowerCase())));
}

export async function parseItemExcel(buffer: Buffer, existingBarcodes: Set<string>): Promise<ParsedItemRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('ไม่พบชีตในไฟล์ Excel');

  const rows: ParsedItemRow[] = [];
  const headers: string[] = [];

  // Item template headers are on Row 2 based on previous analysis
  ws.getRow(2).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = cellStr(cell.value);
  });

  const skuCol = findColIdx(headers, ['sku', 'รหัสสินค้า']);
  const barcodeCol = findColIdx(headers, ['barcode', 'บาร์โค้ด']);
  const nameCol = findColIdx(headers, ['ชื่อสินค้า', 'name']);
  const descCol = findColIdx(headers, ['คำอธิบาย', 'description']);
  const priceCol = findColIdx(headers, ['ราคา', 'price']);
  const catCol = findColIdx(headers, ['category']);

  if (skuCol === -1 || barcodeCol === -1 || nameCol === -1 || priceCol === -1) {
    throw new Error('รูปแบบไฟล์ไม่ถูกต้อง (ต้องมีคอลัมน์ SKU, Barcode, ชื่อสินค้า และราคา)');
  }

  const getCellVal = (row: ExcelJS.Row, colIndex: number) => (colIndex >= 0 ? row.getCell(colIndex + 1).value : null);

  ws.eachRow((row, rowNum) => {
    if (rowNum <= 2) return; // skip headers on row 1 and 2

    const sku = cellStr(getCellVal(row, skuCol));
    const barcode = cellStr(getCellVal(row, barcodeCol));
    const name = cellStr(getCellVal(row, nameCol));
    const description = cellStr(getCellVal(row, descCol));
    let rawPrice = cellStr(getCellVal(row, priceCol));
    const category = cellStr(getCellVal(row, catCol));

    if (!sku && !barcode && !name) return; // skip empty rows

    // Clean price
    if (rawPrice) rawPrice = rawPrice.replace(/,/g, '');
    const price = parseFloat(rawPrice);

    const errors: string[] = [];
    if (!sku) errors.push('ระบุ SKU');
    if (!barcode) errors.push('ระบุ Barcode');
    if (!name) errors.push('ระบุชื่อสินค้า');
    if (isNaN(price) || price < 0) errors.push('ราคาไม่ถูกต้อง');

    let status: 'new' | 'update' | 'invalid' = 'invalid';
    if (errors.length === 0) {
      status = existingBarcodes.has(barcode) ? 'update' : 'new';
    }

    rows.push({
      rowNum,
      sku,
      barcode,
      name,
      description,
      defaultPrice: !isNaN(price) ? price : rawPrice, // Keep rawPrice if invalid so they can fix it in UI
      category,
      status,
      errors,
    });
  });

  return rows;
}
