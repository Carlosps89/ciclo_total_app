
import { NextRequest } from "next/server";
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from "@/lib/athena";
import { COMMON_CTES, getCleanMap } from "@/lib/athena-sql";
import { getCached, setCached } from "@/lib/cache";
import { applyPracaFilter } from "@/lib/pracas";

export const dynamic = 'force-dynamic';

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_v2';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;
    const result = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns = result?.ResultSetMetadata?.ColumnInfo?.map((c: any) => c.Name).filter((n: any): n is string => !!n) || [];
    const map = getCleanMap(columns);
    setCached(cacheKey, map, 6 * 60 * 60 * 1000);
    return map;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const terminal = sp.get('terminal') || 'TRO';
  const range = sp.get('range') || 'today'; 
  const produto = sp.get('produto');
  const praca = sp.get('praca');
  const debug = sp.get('debug');
  // ranges: today, week, month, year

  try {
      const map = await getSchemaMap();
      
      // Timezone & Range Logic (Consistent with /details)
      let timeFilter = "";
      if (range === 'today') {
          timeFilter = "AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp)";
      } else if (range === 'week') {
          timeFilter = "AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo' - interval '7' day, '%Y-%m-%d 00:00:00') as timestamp)";
      } else if (range === 'month') {
          timeFilter = "AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-01 00:00:00') as timestamp)";
      } else if (range === 'year') {
           timeFilter = "AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-01-01 00:00:00') as timestamp)";
      }
      
      const produtoFilterCalc = produto ? `AND produto = '${produto}'` : '';
      
      const pracaFilterCalc = applyPracaFilter(terminal, praca, 'calc.origem');
      if (pracaFilterCalc.isNoMatch) {
          return Response.json({
              items: [],
              debug_praca_warning: pracaFilterCalc.warning
          });
      }

      const sql = `
        ${COMMON_CTES(map, terminal)}
        ${pracaFilterCalc.cte}
        SELECT 
            origem,
            COUNT(DISTINCT gmo_id) as volume,
            AVG(ciclo_total_h) as avg_val,
            approx_percentile(ciclo_total_h, 0.9) as p90
        FROM calc
        ${pracaFilterCalc.join}
        WHERE terminal = '${terminal}'
          ${timeFilter}
          ${produtoFilterCalc}
          AND ciclo_total_h IS NOT NULL 
        GROUP BY origem
        ORDER BY volume DESC
        LIMIT 100
      `;
      
      const result = await runQuery(sql);
      const items: any[] = [];
      if (result && result.Rows && result.Rows.length > 1) {
          const rows = result.Rows.slice(1);
          for(const r of rows) {
              items.push({
                  origem: r.Data[0].VarCharValue || 'Desconhecida',
                  volume: parseInt(r.Data[1].VarCharValue || '0'),
                  avg: parseFloat(r.Data[2].VarCharValue || '0'),
                  p90: parseFloat(r.Data[3].VarCharValue || '0'),
                  // p50 is deprecated for this view, using avg as default
                  p50: parseFloat(r.Data[2].VarCharValue || '0') 
              });
          }
      }
      return Response.json({ items });
  } catch(e: any) {
      console.error(e);
      return Response.json({ error: e.message }, { status: 500 });
  }
}
