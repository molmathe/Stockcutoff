import ExcelJS from 'exceljs';
import { parseExcelData, parseExcelDate, cellStr } from './excelParsers';

describe('Excel Parsers', () => {
  describe('Helpers', () => {
    it('parseExcelDate should handle dates properly', () => {
      expect(parseExcelDate(new Date('2026-02-01'))).toBeInstanceOf(Date);
      expect(parseExcelDate('2026-02-01')).toBeInstanceOf(Date);
      expect(parseExcelDate('01/02/2026')).toBeInstanceOf(Date); // TH format
      expect(parseExcelDate(45678)).toBeInstanceOf(Date); // Excel serialized date
    });

    it('cellStr should convert cell content safely', () => {
      expect(cellStr(' Hello ')).toBe('Hello');
      expect(cellStr(123)).toBe('123');
      expect(cellStr({ richText: [{ text: 'Rich ' }, { text: 'Text' }] })).toBe('Rich Text');
    });
  });

  describe('Parsers', () => {
    /** 
     * Playhouse (was Central format previously)
     * Headers on Row 2: [ Brand, Date, Branch, SKU, Type, Contract Type, Contract, Extra, Sales Quantity, Gross Sales, Discount, Net Sales, ... ]
     * Data on Row 3
     */
    it('should parse PLAYHOUSE format', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['Skip Row 1']);
      ws.addRow(['Brand', 'Date', 'Branch', 'SKU', 'Sales Quantity', 'Net Sales']);
      ws.addRow(['Brand A', '01/02/2026', 'Play House', 'SKU001', 5, 2500]);

      const buffer = await wb.xlsx.writeBuffer();
      const rows = await parseExcelData(buffer as unknown as Buffer, 'PLAYHOUSE');

      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({
        rawBranch: 'Play House',
        rawItem: 'SKU001',
        qty: 5,
        price: 500, // 2500 / 5
      });
      expect(rows[0].saleDate).toBeInstanceOf(Date);
    });

    /**
     * MBK
     * Headers on Row 1: [ Suppl Name, Store Name, Trans Date, Brand Name, Zoning, Item Group, Item Code, Barcode, Item Desc, Quantity, Unit, Sales Price, Sales Amt, Disc %, Disc Amt, Net Sale ]
     * Data on Row 2
     */
    it('should parse MBK format', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['Suppl Name', 'Store Name', 'Trans Date', 'Brand Name', 'Barcode', 'Quantity', 'Sales Amt']);
      ws.addRow(['Sup A', 'At First MBK', new Date('2026-10-15'), 'Brand B', '885000000', 2, 400]);

      const buffer = await wb.xlsx.writeBuffer();
      const rows = await parseExcelData(buffer as unknown as Buffer, 'MBK');

      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({
        rawBranch: 'At First MBK',
        rawItem: '885000000',
        qty: 2,
        price: 200, // 400 / 2
      });
      expect(rows[0].saleDate).toBeInstanceOf(Date);
    });

    /**
     * CENTRAL (was The Mall format previously)
     * Headers on Row 3: [ Store Name, Store Number, Dept, Sub Dept, Brand ID, Brand No., Brand Name, Barcode, SKU, SKU Name, ..., Sales Date, Retail Price, Sales Quantity, ..., Total Net Sales ]
     * Data on Row 4
     */
    it('should parse CENTRAL format', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['Title 1']);
      ws.addRow(['Title 2']);
      ws.addRow(['Store Name', 'Store Number', 'Barcode', 'SKU', 'Sales Date', 'Sales Quantity', 'Total Net Sales']);
      ws.addRow(['Paragon', '001', '885000001', 'SKU_ABC', '2026-05-10', 10, 5000]);

      const buffer = await wb.xlsx.writeBuffer();
      const rows = await parseExcelData(buffer as unknown as Buffer, 'CENTRAL');

      expect(rows[0]).toMatchObject({
        rawBranch: 'Paragon', // Store Name is matched first physically in the headers array
        rawItem: '885000001', // Barcode comes before string 'SKU'
        qty: 10,
        price: 500, // 5000 / 10
      });
      expect(rows[0].saleDate).toBeInstanceOf(Date);
    });

    it('should ignore empty or summary rows', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.addRow(['Brand', 'Date', 'Branch', 'SKU', 'Sales Quantity', 'Net Sales']);
      // Empty row
      ws.addRow([]);
      // Summary row (has no item/branch)
      ws.addRow(['TOTAL', undefined, undefined, undefined, 100, 50000]);

      const buffer = await wb.xlsx.writeBuffer();
      const rows = await parseExcelData(buffer as unknown as Buffer, 'MBK'); // MBK reads row 1 as header
      // Data starts row 2. Row 2 is empty, Row 3 is summary
      expect(rows.length).toBe(0); // Should be filtered out
    });
  });
});
