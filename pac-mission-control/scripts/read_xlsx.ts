
import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.resolve('../PRAÇAS_E_MUNICIPIOS.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(JSON.stringify(data, null, 2));
