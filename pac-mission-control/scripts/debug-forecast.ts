import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE, getAthenaView, getSchemaMap } from "../src/lib/athena";

async function debugForecastAPI() {
    const terminal = "TRO";
    const TARGET_VIEW = await getAthenaView();
    const map = await getSchemaMap(TARGET_VIEW);
    
    // Check raw active count first without the ghost filter!
    let query = `
      WITH raw_data AS (
          SELECT 
            ${map.id} as _col_id,
            ${map.dt_emissao} as _col_emissao,
            ${map.dt_cheguei} as _col_cheguei,
            ${map.dt_chegada} as _col_chegada,
            ${map.dt_chamada} as _col_chamada,
            ${map.dt_peso_saida} as _col_peso_saida,
            ${map.dt_agendamento} as _col_agendamento,
            greatest(
                coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
                coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
            ) as ts_ult
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
          WHERE base.${map.terminal} = '${terminal}'
      ),
      dedupped AS (
          SELECT * FROM (
              SELECT *, 1 as rn
              FROM raw_data
          ) WHERE rn = 1
      ),
      active AS (
          SELECT *,
             greatest(
              coalesce(try_cast(_col_chegada as timestamp), timestamp '1900-01-01 00:00:00'),
              coalesce(try_cast(_col_chamada as timestamp), timestamp '1900-01-01 00:00:00'),
              coalesce(try_cast(_col_cheguei as timestamp), timestamp '1900-01-01 00:00:00')
            ) as ts_last_event
          FROM dedupped
          WHERE (try_cast(_col_peso_saida as timestamp) IS NULL OR coalesce(cast(_col_peso_saida as varchar), '') = '')
      )
      SELECT 
        count(*) as total_active,
        count(case when try_cast(_col_chegada as timestamp) IS NOT NULL THEN 1 END) as in_terminal,
        count(case when try_cast(_col_chamada as timestamp) IS NOT NULL AND try_cast(_col_chegada as timestamp) IS NULL THEN 1 END) as transit,
        count(case when try_cast(_col_cheguei as timestamp) IS NOT NULL AND try_cast(_col_chamada as timestamp) IS NULL THEN 1 END) as external,
        count(case when try_cast(_col_cheguei as timestamp) IS NULL THEN 1 END) as programado
      FROM active
    `;

    try {
        console.log("Fetching RAW ACTIVE volumes...");
        const result = await runQuery(query);
        console.table(result.Rows.slice(1).map(r => ({
            Total: r.Data[0].VarCharValue,
            InTerminal: r.Data[1].VarCharValue,
            Transit: r.Data[2].VarCharValue,
            External: r.Data[3].VarCharValue,
            Programmed: r.Data[4].VarCharValue
        })));
    } catch (e) {
        console.error("Failed:", e);
    }
}

debugForecastAPI();
