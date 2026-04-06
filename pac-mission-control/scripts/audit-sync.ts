import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE, ATHENA_VIEW, getSchemaMap } from "../src/lib/athena";

async function auditSync() {
    console.log("--- PAC SYNC AUDIT ---");
    const now = new Date();
    console.log("Current Server Time (UTC):", now.toISOString());

    const map = await getSchemaMap();

    const query = `
        SELECT 
            'RAW_VIEW' as source,
            hour(try_cast(${map.dt_peso_saida} as timestamp)) as h,
            count(*) as vol,
            max(try_cast(${map.dt_peso_saida} as timestamp)) as last_exit
        FROM "${ATHENA_DATABASE}"."vw_ciclo_v2"
        WHERE try_cast(${map.dt_peso_saida} as timestamp) >= date_add('hour', -6, now())
          AND terminal = 'TRO'
        GROUP BY 1, 2
        UNION ALL
        SELECT 
            'SNAPSHOT' as source,
            hour(try_cast(peso_saida as timestamp)) as h,
            count(*) as vol,
            max(try_cast(peso_saida as timestamp)) as last_exit
        FROM "${ATHENA_DATABASE}"."pac_clean_data"
        WHERE try_cast(peso_saida as timestamp) >= date_add('hour', -6, now())
          AND terminal = 'TRO'
        GROUP BY 1, 2
        ORDER BY h DESC, source ASC
    `;

    try {
        const result = await runQuery(query);
        console.log("Hour-by-Hour Comparison (Last 6h):");
        const rows = result.Rows.slice(1).map(r => ({
            hour: r.Data[1].VarCharValue,
            source: r.Data[0].VarCharValue,
            vol: r.Data[2].VarCharValue,
            last_exit: r.Data[3].VarCharValue
        }));
        console.table(rows);
    } catch (e) {
        console.error("Audit failed:", e);
    }
}

auditSync();
