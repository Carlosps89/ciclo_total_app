import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { normalizeClient } from './clients';

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pac_history.db');
const db = new Database(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS gmo_history (
        gmo_id TEXT PRIMARY KEY,
        terminal TEXT,
        origem TEXT,
        produto TEXT,
        dt_inicio DATETIME,
        dt_peso_saida DATETIME,
        ciclo_total_h REAL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gmo_terminal ON gmo_history(terminal);
    CREATE INDEX IF NOT EXISTS idx_gmo_saida ON gmo_history(dt_peso_saida);
`);

// Migration: Check and add missing columns
const tableInfo = db.prepare("PRAGMA table_info(gmo_history)").all() as any[];

const hasCliente = tableInfo.some(col => col.name === 'cliente');
if (!hasCliente) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN cliente TEXT;");
}

const hasClienteNorm = tableInfo.some(col => col.name === 'cliente_norm');
if (!hasClienteNorm) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN cliente_norm TEXT;");
}

// Ensure index exists after column is added
db.exec("CREATE INDEX IF NOT EXISTS idx_gmo_cliente_norm ON gmo_history(cliente_norm);");

// One-time Migration for records with null cliente_norm
const needsMigration = db.prepare("SELECT COUNT(*) as cnt FROM gmo_history WHERE cliente_norm IS NULL AND cliente IS NOT NULL").get() as { cnt: number };
if (needsMigration.cnt > 0) {
    console.log(`[DB Migration] Normalizing ${needsMigration.cnt} clients...`);
    const records = db.prepare("SELECT gmo_id, cliente FROM gmo_history WHERE cliente_norm IS NULL").all() as { gmo_id: string, cliente: string }[];
    const update = db.prepare("UPDATE gmo_history SET cliente_norm = ? WHERE gmo_id = ?");
    const transaction = db.transaction((rows: { gmo_id: string, cliente: string }[]) => {
        for (const row of rows) {
            update.run(normalizeClient(row.cliente), row.gmo_id);
        }
    });
    transaction(records);
    console.log(`[DB Migration] Done.`);
}

export interface GMORecord {
    gmo_id: string;
    terminal: string;
    origem: string;
    produto: string;
    cliente: string;
    dt_inicio: string;
    dt_peso_saida: string;
    ciclo_total_h: number;
}

export const saveGMOs = (records: GMORecord[]) => {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO gmo_history (gmo_id, terminal, origem, produto, cliente, cliente_norm, dt_inicio, dt_peso_saida, ciclo_total_h)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((rows: GMORecord[]) => {
        for (const row of rows) {
            const norm = normalizeClient(row.cliente);
            insert.run(row.gmo_id, row.terminal, row.origem, row.produto, row.cliente, norm, row.dt_inicio, row.dt_peso_saida, row.ciclo_total_h);
        }
    });

    transaction(records);
};

export const getHistoryStats = (terminal: string, start: string, end: string, options: { produto?: string, cliente?: string } = {}) => {
    let query = `
        SELECT 
            COUNT(DISTINCT gmo_id) as vol,
            AVG(ciclo_total_h) as avg_h,
            COUNT(CASE WHEN ciclo_total_h > 46.5333 THEN 1 END) as above_meta
        FROM gmo_history
        WHERE terminal = ? 
          AND dt_peso_saida >= ? 
          AND dt_peso_saida <= ?
    `;
    const params: any[] = [terminal, start, end];

    if (options.produto) {
        query += ` AND produto = ?`;
        params.push(options.produto);
    }
    if (options.cliente) {
        query += ` AND cliente_norm = ?`;
        params.push(options.cliente);
    }

    return db.prepare(query).get(...params) as { vol: number, avg_h: number, above_meta: number };
};

export const getClients = (terminal: string): string[] => {
    const rows = db.prepare(`
        SELECT DISTINCT cliente_norm 
        FROM gmo_history 
        WHERE terminal = ? AND cliente_norm IS NOT NULL AND cliente_norm != ''
        ORDER BY cliente_norm ASC
    `).all(terminal) as { cliente_norm: string }[];
    
    return rows.map(r => r.cliente_norm);
};

export const getRawClientsByNorm = (terminal: string, normName: string): string[] => {
    const rows = db.prepare(`
        SELECT DISTINCT cliente 
        FROM gmo_history 
        WHERE terminal = ? AND cliente_norm = ?
    `).all(terminal, normName) as { cliente: string }[];
    
    return rows.map(r => r.cliente);
};

export const getLastSyncTimestamp = (terminal: string): string | null => {
    const row = db.prepare(`
        SELECT MAX(dt_peso_saida) as last_ts 
        FROM gmo_history 
        WHERE terminal = ?
    `).get(terminal) as { last_ts: string | null };
    
    return row?.last_ts || null;
};

export default db;
