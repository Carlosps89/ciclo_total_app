import sqlite3
import os

db_path = '/Users/carlospereira/ciclo_total_app/pac-mission-control/data/pac_history.db'

def run_extraction():
    print("🚀 Iniciando Saneamento de Fila via Python (Modelo 24-Snapshots)...")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    query = """
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
                SUM(CASE WHEN datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_agendamento 
                          AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < COALESCE(MIN(h.janela_agendamento, h.dt_cheguei), '2099-12-31')
                     THEN 1 ELSE 0 END) as count_programado,
                SUM(CASE WHEN h.dt_cheguei IS NOT NULL AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_cheguei 
                          AND (h.dt_chamada IS NULL OR datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < h.dt_chamada)
                          AND julianday(d.dday || ' ' || printf('%02d:00:00', ho.h)) - julianday(h.dt_cheguei) < 2
                     THEN 1 ELSE 0 END) as count_fila_externa,
                SUM(CASE WHEN h.dt_chamada IS NOT NULL AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_chamada 
                          AND (h.dt_chegada IS NULL OR datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < h.dt_chegada)
                          AND julianday(d.dday || ' ' || printf('%02d:00:00', ho.h)) - julianday(h.dt_chamada) < 1
                     THEN 1 ELSE 0 END) as count_transito,
                SUM(CASE WHEN h.dt_chegada IS NOT NULL AND datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) >= h.dt_chegada 
                          AND (h.dt_peso_saida IS NULL OR datetime(d.dday || ' ' || printf('%02d:00:00', ho.h)) < h.dt_peso_saida)
                          AND julianday(d.dday || ' ' || printf('%02d:00:00', ho.h)) - julianday(h.dt_chegada) < 5
                     THEN 1 ELSE 0 END) as count_fila_interna
            FROM days d
            CROSS JOIN hours ho
            CROSS JOIN gmo_history h
            WHERE h.terminal IS NOT NULL
            GROUP BY d.dday, ho.h, h.terminal
        )
    SELECT 
        dday, 
        terminal,
        AVG(count_programado) as lp,
        AVG(count_fila_externa) as le,
        AVG(count_transito) as lt,
        AVG(count_fila_interna) as li
    FROM hourly_snapshots
    GROUP BY dday, terminal;
    """
    
    cur.execute(query)
    rows = cur.fetchall()
    print(f"📊 Processados {len(rows)} dias com a lógica de 24 fotos.")
    
    for row in rows:
        cur.execute("""
            UPDATE gmo_features 
            SET load_programado = ?, load_fila_externa = ?, load_transito = ?, load_fila_interna = ?
            WHERE day = ? AND terminal = ?
        """, (row[2], row[3], row[4], row[5], row[0], row[1]))
    
    conn.commit()
    conn.close()
    print("✅ Saneamento 24-Snapshots concluído.")

if __name__ == "__main__":
    run_extraction()
