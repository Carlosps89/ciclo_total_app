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
const db = new Database(dbPath, { timeout: 15000 });
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');

db.exec(`
    CREATE TABLE IF NOT EXISTS gmo_history (
        gmo_id TEXT PRIMARY KEY,
        terminal TEXT,
        origem TEXT,
        produto TEXT,
        cliente TEXT,
        movimento TEXT,
        dt_inicio DATETIME,
        dt_peso_saida DATETIME,
        ciclo_total_h REAL,
        fila_h REAL DEFAULT 0,
        viagem_h REAL DEFAULT 0,
        interno_h REAL DEFAULT 0,
        dt_chegada DATETIME,
        dt_cheguei DATETIME,
        dt_chamada DATETIME,
        area_verde_h REAL DEFAULT 0,
        dt_agendamento DATETIME,
        janela_agendamento DATETIME,
        placa TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gmo_terminal ON gmo_history(terminal);
    CREATE INDEX IF NOT EXISTS idx_gmo_saida ON gmo_history(dt_peso_saida);

    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE,
        name TEXT,
        is_active INTEGER DEFAULT 1,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS operational_benchmarks (
        key TEXT PRIMARY KEY,
        value REAL,
        description TEXT
    );

    CREATE TABLE IF NOT EXISTS plaza_targets (
        terminal TEXT,
        origem TEXT,
        meta_h REAL,
        PRIMARY KEY (terminal, origem)
    );

    CREATE TABLE IF NOT EXISTS fast_pass_plates (
        terminal TEXT,
        plate TEXT,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (terminal, plate)
    );

    CREATE TABLE IF NOT EXISTS fraud_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        placa TEXT,
        data_suspeita DATETIME,
        indicio TEXT,
        fotos TEXT, -- JSON array de URLs
        payload_json TEXT, -- Dados brutos do Power Automate
        status TEXT DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT,
        whatsapp_number TEXT,
        reports_config TEXT, -- JSON: { daily: boolean, fraud: boolean }
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gmo_features (
        day DATE,
        terminal TEXT,
        volume INTEGER,
        avg_ciclo_total_h REAL,
        avg_veiculos_ativos REAL, -- Inércia Operacional (WIP médio)
        avg_antecipacao_h REAL,
        PRIMARY KEY (day, terminal)
    );

    CREATE TABLE IF NOT EXISTS gmo_forecast (
        day DATE,
        terminal TEXT,
        pred_volume REAL,
        pred_ciclo_total_h REAL,
        pred_veiculos_ativos REAL,
        taxa_antecipacao_atual REAL,
        recom_acao TEXT,
        insight_ia TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (day, terminal)
    );

    INSERT OR IGNORE INTO operational_benchmarks (key, value, description) VALUES ('ciclo_total_meta', 46.5333, 'Meta de Ciclo Total (h)');
    INSERT OR IGNORE INTO operational_benchmarks (key, value, description) VALUES ('p25_benchmark', 40.0, 'Referência P25 de Excelência (h)');
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

// Migration for stages
const hasFila = tableInfo.some(col => col.name === 'fila_h');
if (!hasFila) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN fila_h REAL DEFAULT 0;");
    db.exec("ALTER TABLE gmo_history ADD COLUMN viagem_h REAL DEFAULT 0;");
    db.exec("ALTER TABLE gmo_history ADD COLUMN interno_h REAL DEFAULT 0;");
}

// Migration for audit timestamps
const hasChegada = tableInfo.some(col => col.name === 'dt_chegada');
if (!hasChegada) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN dt_chegada DATETIME;");
    db.exec("ALTER TABLE gmo_history ADD COLUMN dt_cheguei DATETIME;");
    db.exec("ALTER TABLE gmo_history ADD COLUMN dt_chamada DATETIME;");
    db.exec("ALTER TABLE gmo_history ADD COLUMN area_verde_h REAL DEFAULT 0;");
}

const hasAgendamentoCol = tableInfo.some(col => col.name === 'dt_agendamento');
if (!hasAgendamentoCol) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN dt_agendamento DATETIME;");
    db.exec("ALTER TABLE gmo_history ADD COLUMN janela_agendamento DATETIME;");
}

const hasPlaca = tableInfo.some(col => col.name === 'placa');
if (!hasPlaca) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN placa TEXT;");
}

const tableInfoFinal = db.prepare("PRAGMA table_info(gmo_history)").all() as any[];

const hasSituacao = tableInfoFinal.some(col => col.name === 'situacao_descricao');
if (!hasSituacao) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN situacao_descricao TEXT;");
}

const hasEvento = tableInfoFinal.some(col => col.name === 'evento_descricao');
if (!hasEvento) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN evento_descricao TEXT;");
}

// Migration for movimento
const hasMovimento = tableInfo.some(col => col.name === 'movimento');
if (!hasMovimento) {
    db.exec("ALTER TABLE gmo_history ADD COLUMN movimento TEXT;");
}

// Migration for fraud_alerts (fotos and payload_json)
const fraudTableInfo = db.prepare("PRAGMA table_info(fraud_alerts)").all() as any[];
const hasFotos = fraudTableInfo.some(col => col.name === 'fotos');
if (!hasFotos) {
    db.exec("ALTER TABLE fraud_alerts ADD COLUMN fotos TEXT;");
}
const hasPayload = fraudTableInfo.some(col => col.name === 'payload_json');
if (!hasPayload) {
    db.exec("ALTER TABLE fraud_alerts ADD COLUMN payload_json TEXT;");
}

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
    movimento: string;
    dt_inicio: string;
    dt_peso_saida: string | null;
    ciclo_total_h: number;
    fila_h: number;
    viagem_h: number;
    interno_h: number;
    dt_chegada: string | null;
    dt_cheguei: string | null;
    dt_chamada: string | null;
    area_verde_h: number;
    dt_agendamento: string | null;
    janela_agendamento: string | null;
    placa: string | null;
    situacao_descricao: string | null;
    evento_descricao: string | null;
}

export const saveGMOs = (records: GMORecord[]) => {
    const insert = db.prepare(`
        INSERT OR REPLACE INTO gmo_history (
            gmo_id, terminal, origem, produto, cliente, movimento, cliente_norm, 
            dt_inicio, dt_peso_saida, ciclo_total_h, fila_h, viagem_h, interno_h,
            dt_chegada, dt_cheguei, dt_chamada, area_verde_h,
            dt_agendamento, janela_agendamento, placa, situacao_descricao, evento_descricao
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((rows: GMORecord[]) => {
        for (const row of rows) {
            const norm = normalizeClient(row.cliente);
            insert.run(
                row.gmo_id, row.terminal, row.origem, row.produto, row.cliente, row.movimento, norm, 
                row.dt_inicio, row.dt_peso_saida, row.ciclo_total_h,
                row.fila_h || 0, row.viagem_h || 0, row.interno_h || 0,
                row.dt_chegada || null, row.dt_cheguei || null, row.dt_chamada || null,
                row.area_verde_h || 0,
                row.dt_agendamento || null, row.janela_agendamento || null,
                row.placa || null, row.situacao_descricao || null, row.evento_descricao || null
            );
        }
    });

    transaction(records);
};

export const getTargetFor = (terminal: string, origem: string): number => {
    const row = db.prepare("SELECT meta_h FROM plaza_targets WHERE terminal = ? AND (origem = ? OR origem = 'GLOBAL') ORDER BY CASE WHEN origem = ? THEN 0 ELSE 1 END LIMIT 1").get(terminal, origem, origem) as { meta_h: number } | undefined;
    return row?.meta_h || 46.5333;
};

export const getAllTargetsFor = (terminal: string): {origem: string, meta_h: number}[] => {
    return db.prepare("SELECT origem, meta_h FROM plaza_targets WHERE terminal = ?").all(terminal) as {origem: string, meta_h: number}[];
};

export const getHistoryStats = (terminal: string, start: string, end: string, options: { produto?: string, cliente?: string, origem?: string } = {}) => {
    let query = `
        SELECT 
            COUNT(DISTINCT gh.gmo_id) as vol,
            AVG(gh.ciclo_total_h) as avg_h,
            COUNT(CASE WHEN gh.ciclo_total_h > COALESCE(pt.meta_h, 46.5333) THEN 1 END) as above_meta
        FROM gmo_history gh
        LEFT JOIN plaza_targets pt ON gh.terminal = pt.terminal AND gh.origem = pt.origem
        WHERE gh.terminal = ? 
          AND gh.dt_peso_saida >= ? 
          AND gh.dt_peso_saida <= ?
          AND (gh.movimento IS NULL OR gh.movimento != 'CARGA')
    `;
    const params: any[] = [terminal, start, end];

    if (options.produto) {
        query += ` AND gh.produto = ?`;
        params.push(options.produto);
    }
    if (options.origem) {
        query += ` AND gh.origem = ?`;
        params.push(options.origem);
    }
    if (options.cliente) {
        query += ` AND gh.cliente_norm = ?`;
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

export const getPlazaTrendStats = (terminal: string, origem?: string) => {
    let query = `
        SELECT 
            date(dt_peso_saida) as day,
            COUNT(DISTINCT gmo_id) as volume,
            AVG(ciclo_total_h) as avg_cycle
        FROM gmo_history
        WHERE terminal = ?
          AND dt_peso_saida >= strftime('%Y-%m-01', 'now')
    `;
    const params: any[] = [terminal];

    if (origem && origem.toUpperCase() !== 'TRO' && origem.toUpperCase() !== 'TODAS') {
        query += ` AND UPPER(origem) = UPPER(?)`;
        params.push(origem);
    }

    query += ` GROUP BY day ORDER BY day ASC`;

    return db.prepare(query).all(...params) as { day: string, volume: number, avg_cycle: number }[];
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
