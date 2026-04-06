import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(__dirname, "../.env.local") });
import { runQuery, ATHENA_DATABASE } from "../src/lib/athena";

async function debugLegacyView() {
    console.log("Checking situacao_descricao distribution in legacy vw_ciclo...");
    const query = `
        SELECT 
            situacao_descricao,
            count(*) as vol
        FROM "${ATHENA_DATABASE}"."vw_ciclo"
        WHERE terminal = 'TRO'
          AND (
              try_cast(cheguei as timestamp) >= date_add('day', -7, current_timestamp AT TIME ZONE 'America/Sao_Paulo') OR
              try_cast(agendamento as timestamp) >= date_add('day', -7, current_timestamp AT TIME ZONE 'America/Sao_Paulo') OR
              try_cast(janela_agendamento as timestamp) >= date_add('day', -2, current_timestamp AT TIME ZONE 'America/Sao_Paulo')
          )
        GROUP BY situacao_descricao
    `;

    try {
        const result = await runQuery(query);
        console.table(result.Rows.slice(1).map(r => ({
            situacao: r.Data[0]?.VarCharValue || 'NULL',
            vol: r.Data[1]?.VarCharValue || '0',
        })));
    } catch (e) {
        console.error("Failed:", e);
    }
}

debugLegacyView();
