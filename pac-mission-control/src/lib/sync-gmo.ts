import { runQuery, getSchemaMap } from './athena';
import { COMMON_CTES } from './athena-sql';
import { saveGMOs, GMORecord, getLastSyncTimestamp } from './db';

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
            startTime = lastTs;
            partitionFilter = getPartitionFilters(new Date(lastTs));
        } else {
            // Default to start of current year if no history
            const startOfYear = `${new Date().getFullYear()}-01-01 00:00:00`;
            startTime = startOfYear;
            partitionFilter = getPartitionFilters(new Date(startOfYear));
        }
    }

    // Query for GMOs that finished after startTime
    const year = new Date(startTime).getFullYear();
    const query = `
        ${COMMON_CTES(map, terminal, '', year)}
        SELECT 
            gmo_id,
            terminal,
            origem,
            produto,
            cliente,
            dt_emissao as dt_inicio,
            peso_saida as dt_peso_saida,
            ciclo_total_h
        FROM calc
        WHERE peso_saida >= timestamp '${startTime}'
          AND peso_saida IS NOT NULL
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
            dt_inicio: data[5]?.VarCharValue,
            dt_peso_saida: data[6]?.VarCharValue,
            ciclo_total_h: parseFloat(data[7]?.VarCharValue || '0')
        };
    });

    console.log(`[Sync] [${terminal}] Sincronizando ${records.length} registros para o SQLite...`);
    saveGMOs(records);
}
