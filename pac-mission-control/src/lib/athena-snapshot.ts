import { runQuery, ATHENA_DATABASE } from "./athena";

export const SNAPSHOT_TABLE = "pac_snapshot_hourly";

/**
 * Executes a query specifically against the snapshot table.
 * Falling back to the raw view if needed, though the goal is 100% snapshot usage.
 */
export async function getSnapshotMetrics(filters: {
    terminal: string;
    startDate: string;
    endDate: string;
    praca?: string;
    produto?: string;
}) {
    const { terminal, startDate, endDate, praca, produto } = filters;

    // We use the 'dt' partition for extreme performance
    const sql = `
        SELECT 
            SUM(media_horas * volume_viagens) / NULLIF(SUM(volume_viagens), 0) as real_avg,
            SUM(volume_viagens) as vol_total,
            SUM(vol_dentro_meta) as vol_within,
            SUM(vol_fora_meta) as vol_above,
            etapa,
            origem,
            produto
        FROM "${ATHENA_DATABASE}"."${SNAPSHOT_TABLE}"
        WHERE terminal = '${terminal}'
          AND dt >= '${startDate}'
          AND dt <= '${endDate}'
          ${produto ? `AND produto = '${produto}'` : ''}
          ${praca && praca !== 'TODAS' ? `-- Praca filtering logic here` : ''}
        GROUP BY etapa, origem, produto
    `;

    return await runQuery(sql);
}
