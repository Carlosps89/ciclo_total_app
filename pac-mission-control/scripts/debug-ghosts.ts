import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_DATABASE } from "../src/lib/athena";

async function debugGhostTrucks() {
    console.log("Fetching top oldest active trucks in terminal...");
    const query = `
      SELECT 
            gmo_id,
            placa_tracao,
            emissao_nota as emissao,
            agendamento,
            chegada,
            peso_saida,
            situacao_descricao,
            date_diff('hour', try_cast(emissao_nota as timestamp), current_timestamp AT TIME ZONE 'America/Sao_Paulo') as horas_desde_emissao,
            date_diff('hour', coalesce(try_cast(chegada as timestamp), try_cast(cheguei as timestamp), try_cast(agendamento as timestamp)), current_timestamp AT TIME ZONE 'America/Sao_Paulo') as horas_desde_ultimo_evento
      FROM "${ATHENA_DATABASE}"."pac_clean_data"
      WHERE terminal = 'TRO'
        AND dt = 'ACTIVE'
        AND try_cast(emissao_nota as timestamp) IS NOT NULL
        AND try_cast(chegada as timestamp) IS NOT NULL -- MUST BE IN TERMINAL
        AND (try_cast(chegada as timestamp) >= date_add('day', -5, current_timestamp AT TIME ZONE 'America/Sao_Paulo')) -- Meets ghost rule
      ORDER BY horas_desde_emissao DESC
      LIMIT 20
    `;

    try {
        const result = await runQuery(query);
        console.table(result.Rows.slice(1).map(r => ({
            id: r.Data[0]?.VarCharValue,
            placa: r.Data[1]?.VarCharValue,
            emissao: r.Data[2]?.VarCharValue,
            agendamento: r.Data[3]?.VarCharValue,
            chegada: r.Data[4]?.VarCharValue,
            situacao: r.Data[6]?.VarCharValue,
            horas_emissao: r.Data[7]?.VarCharValue,
            horas_ultimo: r.Data[8]?.VarCharValue,
        })));
        
        // Let's also check the avg
        const avgQuery = `
          SELECT 
            count(*) as num_trucks,
            avg(date_diff('hour', try_cast(emissao_nota as timestamp), current_timestamp AT TIME ZONE 'America/Sao_Paulo')) as avg_emissao,
            max(date_diff('hour', try_cast(emissao_nota as timestamp), current_timestamp AT TIME ZONE 'America/Sao_Paulo')) as max_emissao,
            min(date_diff('hour', try_cast(emissao_nota as timestamp), current_timestamp AT TIME ZONE 'America/Sao_Paulo')) as min_emissao
          FROM "${ATHENA_DATABASE}"."pac_clean_data"
          WHERE terminal = 'TRO' AND dt = 'ACTIVE' AND try_cast(emissao_nota as timestamp) IS NOT NULL
            AND try_cast(chegada as timestamp) IS NOT NULL
            AND date_diff('day', try_cast(chegada as timestamp), current_timestamp AT TIME ZONE 'America/Sao_Paulo') <= 5
        `;
        const r2 = await runQuery(avgQuery);
        console.log("Stats for ACTIVE trucks inside terminal (arrived within last 5 days):");
        console.table([{
            volume: r2.Rows[1]?.Data[0]?.VarCharValue,
            avg: r2.Rows[1]?.Data[1]?.VarCharValue,
            max: r2.Rows[1]?.Data[2]?.VarCharValue,
            min: r2.Rows[1]?.Data[3]?.VarCharValue,
        }]);

    } catch (e) {
        console.error("Failed:", e);
    }
}

debugGhostTrucks();
