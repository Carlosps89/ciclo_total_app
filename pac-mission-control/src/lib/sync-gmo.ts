import { runQuery, getSchemaMap } from './athena';
import { COMMON_CTES } from './athena-sql';
import db, { saveGMOs, GMORecord, getLastSyncTimestamp } from './db';

/**
 * Helper to generate partition filters (ano, mes, dia) based on a starting date
 * to minimize data scanned by Athena.
 */
function getPartitionFilters(startDate: Date): string {
    const year = startDate.getFullYear();
    
    // Athena partitions for ano/mes/dia can be either string or int.
    // If we hit a TYPE_MISMATCH, we might need to adjust this.
    // Removing quotes as the error suggested integer comparison issues.
    return `AND ano >= ${year}`;
}

export async function syncFinishedGMOs(terminal: string, options: { daysLookback?: number, forceFromDate?: string } = {}): Promise<void> {
    const map = await getSchemaMap();
    
    let startTime: string;
    let partitionFilter: string = '';

    if (options.forceFromDate) {
        startTime = options.forceFromDate;
        partitionFilter = getPartitionFilters(new Date(startTime));
    } else if (options.daysLookback) {
        const d = new Date();
        d.setDate(d.getDate() - options.daysLookback);
        startTime = d.toISOString().replace('T', ' ').substring(0, 19);
        partitionFilter = getPartitionFilters(d);
    } else {
        // Incremental: Get last record from SQLite
        const lastTs = getLastSyncTimestamp(terminal);
        if (lastTs) {
            // Lookback de 2 dias para capturar registros late-arriving (ex: processados em D+1)
            const lastDate = new Date(lastTs);
            lastDate.setDate(lastDate.getDate() - 2);
            startTime = lastDate.toISOString().replace('T', ' ').substring(0, 19);
            partitionFilter = getPartitionFilters(lastDate);
        } else {
            // Default to start of current year if no history
            const startOfYear = `${new Date().getFullYear()}-01-01 00:00:00`;
            startTime = startOfYear;
            partitionFilter = getPartitionFilters(new Date(startOfYear));
        }
    }

    // Query for GMOs that finished after startTime
    const query = `
        ${COMMON_CTES(map, terminal, partitionFilter, { start: startTime })}
        SELECT 
            gmo_id,
            terminal,
            origem,
            produto,
            cliente,
            movimento,
            dt_emissao as dt_inicio,
            peso_saida as dt_peso_saida,
            ciclo_total_h,
            aguardando_agendamento_h as fila_h,
            tempo_viagem_h as viagem_h,
            tempo_interno_h as interno_h,
            dt_chegada,
            cheguei,
            dt_chamada,
            area_verde_cheguei_h as area_verde_h,
            dt_agendamento,
            janela_agendamento,
            placa_tracao,
            situacao_descricao,
            evento_descricao
        FROM calc
        WHERE (peso_saida >= timestamp '${startTime}' OR peso_saida IS NULL)
          AND (peso_saida IS NOT NULL OR dt_emissao >= date_add('day', -5, current_date))
          AND (ciclo_total_h > 0 OR peso_saida IS NULL)
          AND (situacao_descricao = 'FINALIZADA' OR situacao_descricao IS NULL OR situacao_descricao = 'ABERTA')
    `;

    console.log(`[Sync] [${terminal}] Buscando GMOs finalizados desde ${startTime}...`);
    const results = await runQuery(query);
    
    if (!results || !results.Rows || results.Rows.length <= 1) {
        console.log(`[Sync] [${terminal}] Nenhum novo GMO encontrado para sincronizar.`);
        return;
    }

    // Map Athena rows to GMORecord
    const records: GMORecord[] = results.Rows.slice(1).map((row: any) => {
        const data = row.Data;
        return {
            gmo_id: data[0]?.VarCharValue,
            terminal: data[1]?.VarCharValue,
            origem: data[2]?.VarCharValue,
            produto: data[3]?.VarCharValue,
            cliente: data[4]?.VarCharValue,
            movimento: data[5]?.VarCharValue || 'RODOVIARIO',
            dt_inicio: data[6]?.VarCharValue,
            dt_peso_saida: data[7]?.VarCharValue,
            ciclo_total_h: parseFloat(data[8]?.VarCharValue || '0'),
            fila_h: parseFloat(data[9]?.VarCharValue || '0'),
            viagem_h: parseFloat(data[10]?.VarCharValue || '0'),
            interno_h: parseFloat(data[11]?.VarCharValue || '0'),
            dt_chegada: data[12]?.VarCharValue,
            dt_cheguei: data[13]?.VarCharValue,
            dt_chamada: data[14]?.VarCharValue,
            area_verde_h: parseFloat(data[15]?.VarCharValue || '0'),
            dt_agendamento: data[16]?.VarCharValue,
            janela_agendamento: data[17]?.VarCharValue,
            placa: data[18]?.VarCharValue,
            situacao_descricao: data[19]?.VarCharValue,
            evento_descricao: data[20]?.VarCharValue
        };
    });

    console.log(`[Sync] [${terminal}] Sincronizando ${records.length} registros para o SQLite...`);
    saveGMOs(records);

    // Auto-cleanup stale ghosts in SQLite (older than 5 days and no output weight)
    try {
        db.prepare("DELETE FROM gmo_history WHERE dt_peso_saida IS NULL AND dt_inicio < date('now', '-5 days')").run();
    } catch (e) {
        console.error(`[Sync] [${terminal}] Erro na auto-limpeza:`, e);
    }
}
