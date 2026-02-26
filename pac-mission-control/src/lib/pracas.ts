import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';

// Use TRANSLATE and REGEXP_REPLACE
// Upper -> translate common accents -> regex replace anything not A-Z0-9 or space with space -> collapse spaces -> trim
export function sqlNormalizeExpr(colName: string): string {
  return `
  trim(regexp_replace(
    regexp_replace(
      translate(upper(${colName}), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
      '[^A-Z0-9 ]', ' '
    ), 
    '\\\\s+', ' '
  ))
  `;
}

// TS normalizer for Excel entries and matching
export function normalizeCity(s: string): string {
    if (!s) return '';
    return s.toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
        .replace(/[^A-Z0-9 ]/g, ' ') // replace anything not alphanum or space with space
        .replace(/\s+/g, ' ') // collapse multi spaces
        .trim();
}

interface ExcelRow {
    'TERMINAL ORIGEM': string;
    'PRAÇA': string;
    'MUNICÍPIO': string;
}

// In-memory cache
let pracasByTerminal: Record<string, string[]> | null = null;
let municipiosByTerminalPraca: Record<string, string[]> | null = null;
export let debugPracasError: string | null = null;
export let debugPracasCount: number = 0;

interface PracaWarning {
    warn: string;
    municipios_count: number;
}

export function loadPracasXlsx() {
    if (pracasByTerminal && municipiosByTerminalPraca) return; // already loaded

    pracasByTerminal = {};
    municipiosByTerminalPraca = {};

    try {
        const filePath = path.join(process.cwd(), 'src', 'data', 'pracas_municipios.xlsx');
        const fileBuf = fs.readFileSync(filePath);
        const wb = xlsx.read(fileBuf, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json<ExcelRow>(sheet);
        debugPracasCount = data.length;

        for (const row of data) {
            const terminal = row['TERMINAL ORIGEM'];
            const praca = row['PRAÇA'];
            const municipio = row['MUNICÍPIO'];

            if (!terminal || !praca || !municipio) continue;

            const termKey = String(terminal).trim().toUpperCase();
            const munNorm = normalizeCity(String(municipio));


            const pracaKey = String(praca).trim().toUpperCase();

            // Populate pracasByTerminal
            if (!pracasByTerminal[termKey]) {
                pracasByTerminal[termKey] = [];
            }
            if (!pracasByTerminal[termKey].includes(pracaKey)) {
                pracasByTerminal[termKey].push(pracaKey);
            }

            // Populate municipiosByTerminalPraca
            const combKey = `${termKey}_${pracaKey}`;
            if (!municipiosByTerminalPraca[combKey]) {
                municipiosByTerminalPraca[combKey] = [];
            }
            
            const addMuni = (m: string) => {
                if (!municipiosByTerminalPraca![combKey].includes(m)) {
                    municipiosByTerminalPraca![combKey].push(m);
                }
            };

            addMuni(munNorm);
            
            // Bridge Poxoreu variants (always include both if either is present)
            if (munNorm === 'POXOREO' || munNorm === 'POXOREU') {
                addMuni('POXOREO');
                addMuni('POXOREU');
            }
        }
        
        // Sort pracas alphabetically
        if (pracasByTerminal) {
            for (const k of Object.keys(pracasByTerminal)) {
                pracasByTerminal[k].sort();
            }
        }
    } catch (e: unknown) {
        debugPracasError = e instanceof Error ? e.message : String(e);
        console.error("[PracasLoader] Failed to load pracas xlsx", e);
    }
}

export function getPracas(terminal: string): string[] {
    loadPracasXlsx();
    return pracasByTerminal?.[terminal.toUpperCase()] || [];
}

export function getMunicipiosByPraca(terminal: string, praca: string): string[] {
    loadPracasXlsx();
    const key = `${terminal.toUpperCase()}_${praca.toUpperCase()}`;
    return municipiosByTerminalPraca?.[key] || [];
}

export function applyPracaFilter(terminal: string, praca: string | null | undefined, columnRef: string = 'calc.origem', isFirstCte: boolean = false): { cte: string, join: string, isNoMatch: boolean, warning?: PracaWarning } {
    if (!praca || praca.toUpperCase() === 'TODAS' || praca.toUpperCase() === 'TODOS') {
        return { cte: '', join: '', isNoMatch: false };
    }
    
    const municipios = getMunicipiosByPraca(terminal, praca);
    if (municipios.length === 0) {
        return { 
            cte: '', 
            join: 'AND 1=0', 
            isNoMatch: true,
            warning: { warn: "NO_MATCH_PRACA_ORIGEM", municipios_count: 0 }
        };
    }

    const safeList = municipios.map(m => `('${m.replace(/'/g, "''")}')`).join(',');
    
    const ctePrefix = isFirstCte ? 'WITH ' : ', ';
    return {
        cte: `${ctePrefix}pac_pracas_cte AS ( SELECT * FROM (VALUES ${safeList}) AS t(mun_norm) )`,
        join: `JOIN pac_pracas_cte pac_praca ON pac_praca.mun_norm = ${sqlNormalizeExpr(columnRef)}`,
        isNoMatch: false
    };
}

export function getPracaSqlMapper(terminal: string, columnRef: string = 'calc.origem'): string {
    loadPracasXlsx();
    const terminalPracas = getPracas(terminal);
    if (terminalPracas.length === 0) return columnRef;

    const cases = terminalPracas.map(praca => {
        const municipios = getMunicipiosByPraca(terminal, praca);
        if (municipios.length === 0) return null;
        const safeList = municipios.map(m => `'${m.replace(/'/g, "''")}'`).join(',');
        return `WHEN ${sqlNormalizeExpr(columnRef)} IN (${safeList}) THEN '${praca.toUpperCase()}'`;
    }).filter(Boolean);

    return `(CASE ${cases.join(' ')} ELSE ${columnRef} END)`;
}
