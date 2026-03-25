const ExcelJS = require('exceljs');
const path = require('path');

const templatesDir = path.join(__dirname, '../docs/excel_templates');
const files = ['template-1.xlsx', 'template-2.xlsx', 'template-3.xlsx'];

async function analyze() {
    for (const file of files) {
        console.log(`\n--- Analyzing ${file} ---`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path.join(templatesDir, file));
        const worksheet = workbook.worksheets[0];
        
        let headerRowIdx = 1;
        if (file === 'template-1.xlsx') headerRowIdx = 2;
        if (file === 'template-3.xlsx') headerRowIdx = 3;
        
        const headerRow = worksheet.getRow(headerRowIdx);
        const dataRow = worksheet.getRow(headerRowIdx + 1);
        
        const headers = [];
        headerRow.eachCell({ includeEmpty: true }, (cell) => headers.push(cell.value));
        
        const data = [];
        dataRow.eachCell({ includeEmpty: true }, (cell) => data.push(cell.value));
        
        console.log(`Headers (${headers.length}):`, headers);
        console.log(`Data (${data.length}):`, data);
    }
}

analyze().catch(console.error);
