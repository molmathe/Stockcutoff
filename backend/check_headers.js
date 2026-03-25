const ExcelJS = require('exceljs');
const fs = require('fs');

async function readHeaders(path, rowIdx) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const headers = [];
  ws.getRow(rowIdx).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = cell.value ? cell.value.toString() : '';
  });
  console.log(`\n--- Headers for ${path} (Row ${rowIdx}) ---`);
  console.log(headers);
}

async function main() {
  await readHeaders('/Users/ichitunkk/Developer/Repository/Stockcutoff/docs/excel_templates/central_template.xlsx', 2);
  await readHeaders('/Users/ichitunkk/Developer/Repository/Stockcutoff/docs/excel_templates/mbk_at_first_template.xlsx', 1);
  await readHeaders('/Users/ichitunkk/Developer/Repository/Stockcutoff/docs/excel_templates/playhouse_template.xlsx', 3);
}

main().catch(console.error);
