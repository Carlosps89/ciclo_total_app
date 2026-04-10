
import * as XLSX from 'xlsx';
import * as path from 'path';
import Database from 'better-sqlite3';

const DB_PATH = path.resolve(__dirname, '../data/pac_history.db');
const EXCEL_PATH = path.resolve(__dirname, '../../PRAÇAS_E_MUNICIPIOS.xlsx');

const db = new Database(DB_PATH);

function normalizeName(name: string): string {
    if (!name) return '';
    return name
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .toUpperCase();
}

function parseTargetToHours(val: any): number {
    if (typeof val === 'number') {
        // Se for número (serial do Excel), converte pra horas
        // No Excel 1 = 1 dia.
        return val * 24;
    }
    if (typeof val === 'string') {
        // Formato: "1 day, 01:02:03" ou "01:02:03"
        let hours = 0;
        const dayMatch = val.match(/(\d+)\s+day/);
        if (dayMatch) {
            hours += parseInt(dayMatch[1]) * 24;
        }
        const timePart = val.includes(',') ? val.split(',')[1].trim() : val;
        const timeMatch = timePart.match(/(\d+):(\d+):(\d+)/);
        if (timeMatch) {
            hours += parseInt(timeMatch[1]);
            hours += parseInt(timeMatch[2]) / 60;
            hours += parseInt(timeMatch[3]) / 3600;
        }
        return hours;
    }
    return 46.5333; // Default
}

async function sync() {
    console.log(`[Sync] Lendo Excel: ${EXCEL_PATH}`);
    const workbook = XLSX.readFile(EXCEL_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data: any[] = XLSX.utils.sheet_to_json(sheet);

    console.log(`[Sync] Processando ${data.length} registros...`);

    const insert = db.prepare('INSERT OR REPLACE INTO plaza_targets (terminal, origem, meta_h) VALUES (?, ?, ?)');
    
    let count = 0;
    db.transaction(() => {
        for (const row of data) {
            // Baseado na inspeção anterior:
            // Unnamed: 4 é o Terminal (TRO)
            // Unnamed: 6 é a Origem (Município)
            // Unnamed: 17 é a Meta
            const terminal = normalizeName(row['Unnamed: 4']);
            const origem = normalizeName(row['Unnamed: 6']);
            const metaRaw = row['Unnamed: 17'];

            if (!terminal || !origem) continue;

            const meta_h = parseTargetToHours(metaRaw);
            
            if (meta_h > 0) {
                insert.run(terminal, origem, meta_h);
                count++;
            }
        }
    })();

    console.log(`[Sync] Concluído! ${count} metas importadas.`);
}

sync().catch(console.error);
