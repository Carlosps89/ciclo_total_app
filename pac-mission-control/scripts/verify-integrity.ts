import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE } from "../src/lib/athena";

async function verifyIntegrity() {
    console.log("--- Diagnóstico de Integridade de Dados ---");
    
    const terminal = 'TRO'; // Terminal de teste
    
    // 1. Contagem de registros (últimas 24h)
    const countSql = `
        SELECT 'Original' as source, count(*) as total 
        FROM "${ATHENA_DATABASE}"."vw_ciclo_v2" 
        WHERE terminal = '${terminal}' AND try_cast(peso_saida as date) >= date_add('day', -1, now())
        UNION ALL
        SELECT 'Snapshot' as source, count(*) as total 
        FROM "${ATHENA_DATABASE}"."pac_clean_data" 
        WHERE terminal = '${terminal}' AND try_cast(peso_saida as date) >= date_add('day', -1, now())
    `;
    
    // 2. Média de Ciclo Total (últimas 24h)
    const metricSql = `
        SELECT 'Original' as source, avg(date_diff('second', try_cast(emissao_nota as timestamp), try_cast(peso_saida as timestamp)) / 3600.0) as avg_ciclo
        FROM "${ATHENA_DATABASE}"."vw_ciclo_v2"
        WHERE terminal = '${terminal}' AND try_cast(peso_saida as date) >= date_add('day', -1, now())
        UNION ALL
        SELECT 'Snapshot' as source, avg(date_diff('second', try_cast(emissao_nota as timestamp), try_cast(peso_saida as timestamp)) / 3600.0) as avg_ciclo
        FROM "${ATHENA_DATABASE}"."pac_clean_data"
        WHERE terminal = '${terminal}' AND try_cast(peso_saida as date) >= date_add('day', -1, now())
    `;

    try {
        console.log("Executando comparativo de contagem...");
        const counts = await runQuery(countSql);
        console.table(counts.Rows.map((r: any) => ({ 
            Source: r.Data[0].VarCharValue, 
            Total: r.Data[1].VarCharValue 
        })));

        console.log("\nExecutando comparativo de métricas (Ciclo Médio)...");
        const metrics = await runQuery(metricSql);
        console.table(metrics.Rows.map((r: any) => ({ 
            Source: r.Data[0].VarCharValue, 
            Avg_Ciclo_H: r.Data[1].VarCharValue 
        })));

    } catch (e) {
        console.error("Erro na verificação:", e);
    }
}

verifyIntegrity();
