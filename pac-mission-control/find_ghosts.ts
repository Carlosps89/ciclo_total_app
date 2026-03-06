
import { runQuery } from './src/lib/athena';
import { getCleanMap } from './src/lib/athena-sql';

async function main() {
    const terminal = 'TRO';
    const rawCols = await runQuery(`SELECT * FROM "db_gmo_trusted"."VW_Ciclo" LIMIT 0`)
      .then(res => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name) || []);
    
    const map = getCleanMap(rawCols);

    const query = `
      SELECT 
        ${map.id} as id, 
        ${map.placa} as placa, 
        ${map.dt_cheguei} as cheguei,
        date_diff('hour', try_cast(${map.dt_cheguei} as timestamp), date_add('hour', -4, now())) as horas_espera
      FROM "db_gmo_trusted"."VW_Ciclo"
      WHERE ${map.terminal} = '${terminal}'
        AND ${map.dt_cheguei} IS NOT NULL
        AND ${map.dt_chamada} IS NULL
        AND ${map.dt_peso_saida} IS NULL
        AND date_diff('hour', try_cast(${map.dt_cheguei} as timestamp), date_add('hour', -4, now())) > 48
      ORDER BY horas_espera DESC
      LIMIT 10
    `;

    console.log("Running query to find ghosts...");
    const results = await runQuery(query);
    const rows = results?.Rows?.slice(1) || [];
    
    console.log("--- GHOST VEHICLES (>48h in Fila Externa) ---");
    rows.forEach(r => {
        const d = r.Data;
        console.log(`ID: ${d[0].VarCharValue} | Placa: ${d[1].VarCharValue} | Chegou: ${d[2].VarCharValue} | Espera: ${d[3].VarCharValue}h`);
    });
}

main().catch(console.error);
