const ExcelJS = require('exceljs');
const fs = require('fs');

async function checkFile(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  console.log(`\n--- First 5 rows of ${path.split('/').pop()} ---`);
  
  for (let r = 1; r <= 5; r++) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      vals[colNum - 1] = cell.value ? cell.value.toString() : '';
    });
    console.log(`Row ${r}:`, vals.filter(v => v).length > 0 ? vals : '[(empty)]');
  }
}

async function main() {
  await checkFile('/Users/ichitunkk/Developer/Repository/Stockcutoff/docs/excel_templates/central_template.xlsx');
  await checkFile('/Users/ichitunkk/Developer/Repository/Stockcutoff/docs/excel_templates/playhouse_template.xlsx');
}

main().catch(console.error);
