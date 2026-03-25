import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from "../src/lib/athena";

/**
 * Syncs the last 4 hours of data from the raw view to the clean data table.
 * We use 4 hours to ensure we catch any updates to recent records.
 */
async function syncLatestData() {
    console.log("Starting hourly sync for pac_clean_data...");

    const sql = `
        INSERT INTO "${ATHENA_DATABASE}"."pac_clean_data"
        WITH raw_data AS (
            SELECT *,
                greatest(
                        coalesce(try_cast(peso_saida as timestamp), timestamp '1900-01-01 00:00:00'), 
                        coalesce(try_cast(chegada as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(agendamento as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(emissao_nota as timestamp), timestamp '1900-01-01 00:00:00')
                ) as ts_ult
            FROM "${ATHENA_DATABASE}"."vw_ciclo_v2"
            WHERE (
                try_cast(peso_saida as timestamp) >= date_add('hour', -4, now()) OR
                try_cast(cheguei as timestamp) >= date_add('hour', -4, now())
            )
        ),
        dedupped AS (
            SELECT * FROM (
                SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn 
                FROM raw_data
            ) WHERE rn = 1
        )
        SELECT 
            *,
            format_datetime(cast(peso_saida as date), 'yyyy-MM-dd') as dt
        FROM dedupped
        WHERE NOT EXISTS (
            SELECT 1 FROM "${ATHENA_DATABASE}"."pac_clean_data" target 
            WHERE target.gmo_id = dedupped.gmo_id 
              AND target.dt = format_datetime(cast(dedupped.peso_saida as date), 'yyyy-MM-dd')
        )
    `;

    try {
        const result = await runQuery(sql);
        console.log("Sync completed successfully:", result);
    } catch (e) {
        console.error("Sync failed:", e);
    }
}

syncLatestData();
