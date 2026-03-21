import ExcelJS from 'exceljs';
import { parseItemExcel } from './itemParser';

describe('Item Parser', () => {
  it('should parse item data from row 3 correctly and detect existing items', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Skip Row 1']);
    ws.addRow(['SKU (รหัสสินค้า)', 'Barcode', 'ชื่อสินค้า', 'หมวดหมู่/คำอธิบาย', 'ราคา', 'Category']);
    ws.addRow(['ITEM001', '885001', 'Shirt', 'Red Shirt', '250', 'Clothing']);
    ws.addRow(['ITEM002', '885002', 'Pants', 'Blue Pants', 'invalid', 'Clothing']); // Invalid price
    ws.addRow(['', '885003', 'Shoes', '', '1000', '']); // Invalid missing sku

    const buffer = await wb.xlsx.writeBuffer();
    const existingSkus = new Set(['ITEM001']);
    
    const rows = await parseItemExcel(buffer as unknown as Buffer, existingSkus);

    expect(rows.length).toBe(3);
    
    // ITEM001 - Update
    expect(rows[0]).toMatchObject({
      sku: 'ITEM001',
      barcode: '885001',
      name: 'Shirt',
      description: 'Red Shirt',
      defaultPrice: 250,
      category: 'Clothing',
      status: 'update',
      errors: []
    });

    // ITEM002 - Invalid Price
    expect(rows[1]).toMatchObject({
      sku: 'ITEM002',
      status: 'invalid'
    });
    expect(rows[1].errors).toContain('ราคาไม่ถูกต้อง');

    // Missing SKU
    expect(rows[2]).toMatchObject({
      name: 'Shoes',
      status: 'invalid',
    });
    expect(rows[2].errors).toContain('ระบุ SKU');
  });

  it('should format thousands price correctly', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Skip Row 1']);
    ws.addRow(['SKU', 'Barcode', 'Name', 'Desc', 'Price', 'Cat']);
    ws.addRow(['ITEMX', 'BX', 'NX', 'DX', '2,500.50', 'CX']);

    const buffer = await wb.xlsx.writeBuffer();
    const rows = await parseItemExcel(buffer as unknown as Buffer, new Set());

    expect(rows[0]).toMatchObject({
      sku: 'ITEMX',
      defaultPrice: 2500.50,
      status: 'new'
    });
  });

  it('should throw if missing headers', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Skip Row 1']);
    ws.addRow(['Random']);
    const buffer = await wb.xlsx.writeBuffer();
    
    await expect(parseItemExcel(buffer as unknown as Buffer, new Set())).rejects.toThrow('รูปแบบไฟล์ไม่ถูกต้อง');
  });
});
