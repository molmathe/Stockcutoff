import ExcelJS from 'exceljs';
import { parseBranchExcel } from './branchParser';

describe('Branch Parser', () => {
  it('should parse branch data and correctly identify new/update statuses', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Branch Code', 'Branch Name', 'Province', 'Store Number', 'Branch Type']);
    ws.addRow(['B001', 'Bangkok Branch', 'BKK', 'S01', 'POS']);
    ws.addRow(['B002', 'Phuket Branch', 'HKT', 'S02', 'TEMP']);
    ws.addRow(['', 'No Code Branch', 'CMX', '', '']); // Invalid

    const buffer = await wb.xlsx.writeBuffer();
    
    // Simulate DB with existing B001
    const existingCodes = new Set(['B001']);
    
    const rows = await parseBranchExcel(buffer as unknown as Buffer, existingCodes);

    expect(rows.length).toBe(3);
    
    // B001 - Update
    expect(rows[0]).toMatchObject({
      code: 'B001',
      name: 'Bangkok Branch',
      address: 'BKK',
      reportBranchId: 'S01',
      type: 'PERMANENT', // POS mapping
      status: 'update',
      errors: []
    });

    // B002 - New
    expect(rows[1]).toMatchObject({
      code: 'B002',
      name: 'Phuket Branch',
      type: 'TEMPORARY',
      status: 'new',
      errors: []
    });

    // Invalid missing code
    expect(rows[2]).toMatchObject({
      name: 'No Code Branch',
      status: 'invalid',
    });
    expect(rows[2].errors).toContain('ระบุรหัสสาขา');
  });

  it('should throw an error if missing basic required columns', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Something Random', 'Price']);
    ws.addRow(['B001', '100']);

    const buffer = await wb.xlsx.writeBuffer();
    
    await expect(parseBranchExcel(buffer as unknown as Buffer, new Set())).rejects.toThrow('รูปแบบไฟล์ไม่ถูกต้อง');
  });
});
