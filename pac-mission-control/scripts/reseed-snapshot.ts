import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE } from "../src/lib/athena";

/**
 * Performs a full cleanup and reseed of the pac_clean_data table.
 * This is used to apply new partitioning logic (e.g. 'ACTIVE' partition for null departures).
 */
async function reseedTable() {
    console.log("!!! STARTING FULL RESEED OF pac_clean_data !!!");

    const dropTable = `DROP TABLE IF EXISTS ${ATHENA_DATABASE}.pac_clean_data`;
    
    // Using the same structure as the original sync but ensuring dt is never null.
    // Partitioning by 'dt' ensures efficient cleanup by dropping partitions.
    const createTable = `
        CREATE TABLE ${ATHENA_DATABASE}.pac_clean_data
        WITH (
          format = 'PARQUET',
          partitioned_by = ARRAY['dt']
        ) AS
        WITH raw_data AS (
            SELECT *,
                greatest(
                        coalesce(try_cast(peso_saida as timestamp), timestamp '1900-01-01 00:00:00'), 
                        coalesce(try_cast(chegada as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(agendamento as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(emissao_nota as timestamp), timestamp '1900-01-01 00:00:00')
                ) as ts_ult
            FROM ${ATHENA_DATABASE}.vw_ciclo
            WHERE (
                try_cast(peso_saida as timestamp) >= date_add('day', -90, current_timestamp AT TIME ZONE 'America/Sao_Paulo') OR
                try_cast(cheguei as timestamp) >= date_add('day', -90, current_timestamp AT TIME ZONE 'America/Sao_Paulo') OR
                try_cast(agendamento as timestamp) >= date_add('day', -90, current_timestamp AT TIME ZONE 'America/Sao_Paulo') OR
                try_cast(janela_agendamento as timestamp) >= date_add('day', -30, current_timestamp AT TIME ZONE 'America/Sao_Paulo')
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
            coalesce(format_datetime(try_cast(peso_saida as timestamp), 'yyyy-MM-dd'), 'ACTIVE') as dt
        FROM dedupped
    `;

    try {
        console.log("Step 1: Dropping old table...");
        await runQuery(dropTable);
        
        console.log("Step 2: Recreating and loading data (this may take a minute)...");
        const result = await runQuery(createTable);
        
        console.log("FULL RESEED COMPLETED SUCCESSFULLY:", result);
    } catch (e) {
        console.error("RESEED FAILED:", e);
    }
}

reseedTable();
