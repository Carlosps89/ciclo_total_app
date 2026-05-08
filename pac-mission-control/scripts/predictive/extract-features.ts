import * as dotenv from "dotenv";
import { resolve } from "path";
import Database from 'better-sqlite3';

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../../.env.local") });

const dbPath = resolve(__dirname, "../../data/pac_history.db");
const db = new Database(dbPath);

async function extractFeatures() {
    console.log("🚀 Iniciando extração de features MULTI-BUFFER (Modelo 24-Snapshots / Hora-a-Hora)...");

    const query = `
        WITH RECURSIVE 
        days(dday) AS (
            SELECT date('now', '-30 days')
            UNION ALL
            SELECT date(dday, '+1 day') FROM days WHERE dday < date('now')
        ),
        hours(h) AS (
            SELECT 0 UNION ALL SELECT h + 1 FROM hours WHERE h < 23
        ),
        hourly_snapshots AS (
            SELECT 
                d.dday,
                ho.h,
                h.terminal,
                
                -- 1. Programado: Agendamento até min(Janela, Cheguei)
                SUM(CASE WHEN datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_agendamento 
                          AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < COALESCE(MIN(h.janela_agendamento, h.dt_cheguei), '2099-12-31')
                          AND julianday(d.dday || ' ' || printf('%02d:00:00', ho.h)) - julianday(h.dt_agendamento) < 15 -- Max 15 dias
                     THEN 1 ELSE 0 END) as count_programado,
                
                -- 2. Fila Externa: Cheguei até Chamada (Corte 48h para realismo)
                SUM(CASE WHEN h.dt_cheguei IS NOT NULL AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_cheguei 
                          AND (h.dt_chamada IS NULL OR datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < h.dt_chamada)
                          AND julianday(d.dday || ' ' || printf('%02d:00:00', ho.h)) - julianday(h.dt_cheguei) < 2 -- Max 48h
                     THEN 1 ELSE 0 END) as count_fila_externa,
                
                -- 3. Em Trânsito: Chamada até Chegada (Corte 24h)
                SUM(CASE WHEN h.dt_chamada IS NOT NULL AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_chamada 
                          AND (h.dt_chegada IS NULL OR datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < h.dt_chegada)
                          AND julianday(d.dday || ' ' || printf('%02d:00:00', ho.h)) - julianday(h.dt_chamada) < 1 -- Max 24h
                     THEN 1 ELSE 0 END) as count_transito,
                
                -- 4. Fila Interna: Chegada até Peso de Saída (Corte 120h)
                SUM(CASE WHEN h.dt_chegada IS NOT NULL AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_chegada 
                          AND (h.dt_peso_saida IS NULL OR datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < h.dt_peso_saida)
                          AND julianday(d.dday || ' ' || printf('%02d:00:00', ho.h)) - julianday(h.dt_chegada) < 5 -- Max 120h
                     THEN 1 ELSE 0 END) as count_fila_interna
            FROM days d
            CROSS JOIN hours ho
            CROSS JOIN gmo_history h
            WHERE h.terminal IS NOT NULL
            GROUP BY d.dday, ho.h, h.terminal
        ),
        daily_averages AS (
            SELECT 
                dday as day,
                terminal,
                AVG(count_programado) as load_programado,
                AVG(count_fila_externa) as load_fila_externa,
                AVG(count_transito) as load_transito,
                AVG(count_fila_interna) as load_fila_interna
            FROM hourly_snapshots
            GROUP BY dday, terminal
        ),
        exits AS (
            SELECT 
                date(datetime(dt_peso_saida, '-3 hours')) as day,
                terminal,
                COUNT(*) as volume,
                AVG(ciclo_total_h) as avg_ciclo_total_h
            FROM gmo_history
            WHERE dt_peso_saida IS NOT NULL
            GROUP BY day, terminal
        )
        SELECT 
            s.day, 
            s.terminal, 
            COALESCE(e.volume, 0) as volume, 
            COALESCE(e.avg_ciclo_total_h, 0) as avg_ciclo_total_h,
            s.load_programado,
            s.load_fila_externa,
            s.load_transito,
            s.load_fila_interna
        FROM daily_averages s
        LEFT JOIN exits e ON s.day = e.day AND s.terminal = e.terminal
        ORDER BY s.day DESC;
    `;

    try {
        db.exec("PRAGMA temp_store = MEMORY;");
        db.exec("PRAGMA journal_mode = WAL;");
        
        const rows = db.prepare(query).all() as any[];
        console.log(`📊 Salvando média de 24 snapshots para ${rows.length} dias...`);

        const insert = db.prepare(`
            INSERT OR REPLACE INTO gmo_features (
                day, terminal, volume, avg_ciclo_total_h, 
                load_programado, load_fila_externa, load_transito, load_fila_interna
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const transaction = db.transaction((data) => {
            for (const row of data) {
                insert.run(
                    row.day, 
                    row.terminal, 
                    row.volume, 
                    row.avg_ciclo_total_h,
                    row.load_programado || 0, 
                    row.load_fila_externa || 0, 
                    row.load_transito || 0, 
                    row.load_fila_interna || 0
                );
            }
        });

        transaction(rows);
        console.log("✅ Features 24-Snapshots salvas com sucesso.");

    } catch (error) {
        console.error("❌ Erro durante a extração de snapshots horários:", error);
    } finally {
        db.close();
    }
}

extractFeatures();
