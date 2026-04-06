import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE, getSchemaMap } from "../src/lib/athena";

async function globalAudit() {
    console.log("--- GLOBAL RAW DATA AUDIT ---");
    const map = await getSchemaMap("vw_ciclo_v2");
    
    const query = `
        SELECT 
            terminal,
            count(*) as vol,
            max(try_cast(${map.dt_peso_saida} as timestamp)) as last_exit
        FROM "${ATHENA_DATABASE}"."vw_ciclo_v2"
        WHERE try_cast(${map.dt_peso_saida} as timestamp) >= date_add('hour', -4, now())
        GROUP BY 1
        ORDER BY last_exit DESC
    `;

    try {
        const result = await runQuery(query);
        console.table(result.Rows.slice(1).map(r => ({
            terminal: r.Data[0].VarCharValue,
            vol: r.Data[1].VarCharValue,
            last_exit: r.Data[2].VarCharValue
        })));
    } catch (e) {
        console.error(e);
    }
}

globalAudit();
