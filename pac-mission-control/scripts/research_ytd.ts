import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { runQuery, getSchemaMap } from '../src/lib/athena';
import { COMMON_CTES } from '../src/lib/athena-sql';

async function main() {
    const map = await getSchemaMap();
    console.log('--- Pesquisa de Divergência YTD 2026 ---');

    const queries = [
        {
            name: "Default (Base do Dashboard)",
            sql: `
                ${COMMON_CTES(map, 'TRO', '', { start: '2026-01-01', end: '2026-04-30' })}
                SELECT COUNT(*), AVG(ciclo_total_h) FROM calc WHERE ciclo_total_h >= 1.0
            `
        },
        {
            name: "Apenas Situacao = Concluido (ou similar)",
            sql: `
                ${COMMON_CTES(map, 'TRO', '', { start: '2026-01-01', end: '2026-04-30' })}
                SELECT COUNT(*), AVG(ciclo_total_h) FROM calc 
                WHERE ciclo_total_h >= 1.0 
                  AND (situacao_descricao LIKE '%CONCLU%' OR situacao_descricao LIKE '%FINALIZ%')
            `
        },
         {
            name: "Sem filtro de 1.0h",
            sql: `
                ${COMMON_CTES(map, 'TRO', '', { start: '2026-01-01', end: '2026-04-30' })}
                SELECT COUNT(*), AVG(ciclo_total_h) FROM calc
            `
        }
    ];

    for (const q of queries) {
        console.log(`\nExecutando: ${q.name}...`);
        const result = await runQuery(q.sql);
        console.log(`Resultado ${q.name}:`, result.Rows[1].Data.map((d: any) => d.VarCharValue));
    }
}

main().catch(console.error);
