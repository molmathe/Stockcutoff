import ExcelJS from 'exceljs';
import { cellStr } from './excelParsers';

export interface ParsedBranchRow {
  rowNum: number;
  code: string;
  name: string;
  address: string;
  reportBranchId: string;
  type: string; // 'PERMANENT' | 'TEMPORARY'
  status: 'new' | 'update' | 'invalid';
  errors: string[];
}

function findColIdx(headers: string[], possibleNames: string[]): number {
  return headers.findIndex((h) => possibleNames.some((p) => h && h.toLowerCase().includes(p.toLowerCase())));
}

export async function parseBranchExcel(buffer: Buffer, existingCodes: Set<string>): Promise<ParsedBranchRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('ไม่พบชีตในไฟล์ Excel');

  const rows: ParsedBranchRow[] = [];
  const headers: string[] = [];

  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = cellStr(cell.value);
  });

  const codeCol = findColIdx(headers, ['branch code', 'code']);
  const nameCol = findColIdx(headers, ['branch name', 'name']);
  const addressCol = findColIdx(headers, ['province', 'address']);
  const numberCol = findColIdx(headers, ['store number']);
  const typeCol = findColIdx(headers, ['branch type', 'type']);

  if (codeCol === -1 || nameCol === -1) {
    throw new Error('รูปแบบไฟล์ไม่ถูกต้อง (ต้องมีคอลัมน์ Branch Code และ Branch Name)');
  }

  const getCellVal = (row: ExcelJS.Row, colIndex: number) => (colIndex >= 0 ? row.getCell(colIndex + 1).value : null);

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header

    const code = cellStr(getCellVal(row, codeCol));
    const name = cellStr(getCellVal(row, nameCol));
    const address = cellStr(getCellVal(row, addressCol));
    const storeNum = cellStr(getCellVal(row, numberCol));
    const rawType = cellStr(getCellVal(row, typeCol)).toUpperCase();

    if (!code && !name && !address) return; // skip empty rows

    let type = 'PERMANENT';
    if (rawType.includes('TEMP')) type = 'TEMPORARY';

    const errors: string[] = [];
    if (!code) errors.push('ระบุรหัสสาขา');
    if (!name) errors.push('ระบุชื่อสาขา');

    let status: 'new' | 'update' | 'invalid' = 'invalid';
    if (errors.length === 0) {
      status = existingCodes.has(code) ? 'update' : 'new';
    }

    rows.push({
      rowNum,
      code,
      name,
      address,
      reportBranchId: storeNum,
      type,
      status,
      errors,
    });
  });

  return rows;
}
