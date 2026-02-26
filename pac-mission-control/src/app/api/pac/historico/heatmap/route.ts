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

    try {
        const map = await getSchemaMap();
        const pracaFilterEarly = applyPracaFilter(terminal, praca, 'calc.origem');
        const produtoFilter = produto ? `AND produto = '${produto}'` : '';
        
        const sql = `
            ${COMMON_CTES(map, terminal)}
            ${pracaFilterEarly.cte}
            SELECT 
                date(peso_saida) as d,
                hour(peso_saida) as h,
                AVG(ciclo_total_h) as ciclo_medio,
                COUNT(DISTINCT gmo_id) as volume
            FROM calc
            ${pracaFilterEarly.join}
            WHERE terminal = '${terminal}'
              ${produtoFilter}
              AND peso_saida >= timestamp '${startDate} 00:00:00'
              AND peso_saida <= timestamp '${endDate} 23:59:59'
              AND ciclo_total_h IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1, 2
        `;

        const result = await runQuery(sql);
        const heatmap: any[] = [];

        if (result && result.Rows && result.Rows.length > 1) {
            result.Rows.slice(1).forEach((r: any) => {
                heatmap.push({
                    day: r.Data[0].VarCharValue,
                    hour: parseInt(r.Data[1].VarCharValue || '0'),
                    ciclo_medio: parseFloat(parseFloat(r.Data[2].VarCharValue || '0').toFixed(1)),
                    volume: parseInt(r.Data[3].VarCharValue || '0')
                });
            });
        }

        return Response.json({
            startDate,
            endDate,
            data: heatmap
        });

    } catch (e: any) {
        console.error("Historical Heatmap Error:", e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
