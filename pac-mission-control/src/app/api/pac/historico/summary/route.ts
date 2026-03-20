import { NextRequest } from "next/server";
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from "@/lib/athena";
import { COMMON_CTES, getCleanMap } from "@/lib/athena-sql";
import { getCached, setCached } from "@/lib/cache";
import { applyPracaFilter } from "@/lib/pracas";

export const dynamic = 'force-dynamic';

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_v3';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;
    
    const result = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns = result?.ResultSetMetadata?.ColumnInfo?.map((c: { Name: string }) => c.Name).filter((n: string | undefined): n is string => !!n) || [];
    const map = getCleanMap(columns);
    
    setCached(cacheKey, map, 6 * 60 * 60 * 1000);
    return map;
}

export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const terminal = sp.get('terminal') || 'TRO';
    const startDate = sp.get('startDate'); // YYYY-MM-DD
    const endDate = sp.get('endDate');     // YYYY-MM-DD
    const praca = sp.get('praca') || 'TODAS';
    const produto = sp.get('produto');

    if (!startDate || !endDate) {
        return Response.json({ error: "Missing startDate or endDate" }, { status: 400 });
    }

    const cacheKey = `pac_hist_summary_v2_${terminal}_${startDate}_${endDate}_${praca}_${produto || 'all'}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return Response.json(cachedData);

    try {
        const map = await getSchemaMap();
        const pracaFilterEarly = applyPracaFilter(terminal, praca, 'calc.origem');
        const produtoFilter = produto ? `AND produto = '${produto}'` : '';
        
        const sql = `
            ${COMMON_CTES(map, terminal)}
            ${pracaFilterEarly.cte}
            SELECT 
                COUNT(DISTINCT gmo_id) as volume_total,
                AVG(ciclo_total_h) as ciclo_medio,
                COUNT(CASE WHEN ciclo_total_h > 46.53 THEN 1 END) as acima_meta_count
            FROM calc
            ${pracaFilterEarly.join}
            WHERE terminal = '${terminal}'
              ${produtoFilter}
              AND peso_saida >= timestamp '${startDate} 00:00:00'
              AND peso_saida <= timestamp '${endDate} 23:59:59'
              AND ciclo_total_h IS NOT NULL
        `;

        const result = await runQuery(sql);
        let summary = {
            volume_total: 0,
            ciclo_medio: 0,
            acima_meta_pct: 0,
            meta_h: 46.53
        };

        if (result && result.Rows && result.Rows.length > 1) {
            const r = result.Rows[1].Data;
            const vol = parseInt(r[0].VarCharValue || '0');
            const avg = parseFloat(r[1].VarCharValue || '0');
            const acima = parseInt(r[2].VarCharValue || '0');
            
            summary = {
                volume_total: vol,
                ciclo_medio: parseFloat(avg.toFixed(1)),
                acima_meta_pct: vol > 0 ? parseFloat(((acima / vol) * 100).toFixed(1)) : 0,
                meta_h: 46.53
            };
        }

        setCached(cacheKey, summary);
        return Response.json(summary);

    } catch (e: any) {
        console.error("Historical Summary Error:", e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
