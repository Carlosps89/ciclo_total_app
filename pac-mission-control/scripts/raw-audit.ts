import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE, ATHENA_VIEW, getSchemaMap } from "../src/lib/athena";

async function deepAudit() {
    console.log("--- 16H RAW DATA AUDIT ---");
    const map = await getSchemaMap("vw_ciclo_v2");
    
    const query = `
        SELECT 
            ${map.id} as id,
            ${map.placa} as placa,
            try_cast(${map.dt_peso_saida} as timestamp) as saida
        FROM "${ATHENA_DATABASE}"."vw_ciclo_v2"
        WHERE terminal = 'TRO'
          AND try_cast(${map.dt_peso_saida} as timestamp) >= timestamp '2026-03-26 16:00:00'
          AND try_cast(${map.dt_peso_saida} as timestamp) <= timestamp '2026-03-26 16:59:59'
        ORDER BY saida DESC
        LIMIT 50
    `;

    try {
        const result = await runQuery(query);
        console.log(`Exits found for 16h: ${result.Rows.length - 1}`);
        console.table(result.Rows.slice(1).map(r => ({
            id: r.Data[0].VarCharValue,
            placa: r.Data[1].VarCharValue,
            saida: r.Data[2].VarCharValue
        })));
    } catch (e) {
        console.error(e);
    }
}

deepAudit();
