import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runQuery, ATHENA_VIEW, ATHENA_DATABASE, getSchemaMap } from "../src/lib/athena";
import { COMMON_CTES } from "../src/lib/athena-sql";

function getBRTComponents(date: Date) {
    const fmt = (options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...options }).format(date);
    const ymd: string = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
    const h: string = fmt({ hour: '2-digit', hour12: false });
    return { ymd, h };
}

async function debugCicloTotal() {
    const now = new Date();
    const brt = getBRTComponents(now);
    const map = await getSchemaMap();
    const META_H = 46.5333;
    const terminal = 'TRO';

    const buckets = [0, 1, 2, 3].map((i) => {
        const d = new Date(now.getTime() - i * 60 * 60 * 1000);
        const c = getBRTComponents(d);
        return { i, start: `${c.ymd} ${c.h}:00:00`, end: `${c.ymd} ${c.h}:59:59`, label: `${c.h}h` };
    });

    const query = `
        ${COMMON_CTES(map, terminal, '')}
        SELECT
            ${buckets.map(b => `
            count(distinct CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' THEN gmo_id END) as h${b.i}_vol,
            avg(CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' THEN ciclo_total_h END) as h${b.i}_avg
            `).join(',\n')},
            count(distinct gmo_id) as d_vol,
            max(peso_saida) as last_update
        FROM calc
        WHERE peso_saida >= timestamp '${brt.ymd} 00:00:00' 
          AND peso_saida <= timestamp '${brt.ymd} 23:59:59'
    `;

    console.log("Executing Query for:", brt.ymd, "at hour", brt.h);
    console.log("Buckets:", buckets);

    try {
        const result = await runQuery(query);
        const row = result.Rows[1].Data;
        console.log("Raw Result Row:");
        console.table(row.map((r, i) => ({ index: i, value: r.VarCharValue })));
    } catch (e) {
        console.error("Query failed:", e);
    }
}

debugCicloTotal();
