
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
  const dateResult = sp.get('date');
  const topN = parseInt(sp.get('top') || '30');
  const produto = sp.get('produto');
  const praca = sp.get('praca');
  const debug = sp.get('debug');

  // Date Logic: Default Today BRT
  let dateFilterClause = '';
  if (dateResult) {
      dateFilterClause = `
          AND peso_saida >= cast('${dateResult} 00:00:00' as timestamp)
          AND peso_saida <  cast('${dateResult} 00:00:00' as timestamp) + interval '1' day
      `;
  } else {
      dateFilterClause = `
          AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp)
          AND peso_saida <  cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp) + interval '1' day
      `;
  }
  const produtoFilterCalc = produto ? `AND produto = '${produto}'` : '';
  
  const pracaFilterCalc = applyPracaFilter(terminal, praca, 'calc.origem');
  if (pracaFilterCalc.isNoMatch) {
      return Response.json({
          hours: [], origins: [], matrix: [], volume_matrix: [],
          debug_praca_warning: pracaFilterCalc.warning
      });
  }

  try {
     const map = await getSchemaMap();

     // 1. Get Top N Origins by Volume
     const topSql = `
        ${COMMON_CTES(map, terminal)}
        ${pracaFilterCalc.cte}
        SELECT 
            origem, 
            count(distinct gmo_id) as vol
        FROM calc
        ${pracaFilterCalc.join}
        WHERE terminal = '${terminal}'
          ${dateFilterClause}
          ${produtoFilterCalc}
          AND ciclo_total_h IS NOT NULL
        GROUP BY origem
        ORDER BY vol DESC
        LIMIT ${topN}
     `;
     const topRes = await runQuery(topSql);
     const topOrigins: string[] = [];
     if(topRes && topRes.Rows && topRes.Rows.length > 1) {
         topRes.Rows.slice(1).forEach((r: any) => {
             if(r.Data[0].VarCharValue) topOrigins.push(r.Data[0].VarCharValue);
         });
     }

     if(topOrigins.length === 0) {
         return Response.json({ hours: [], origins: [], matrix: [], volume_matrix: [] });
     }

     const originListStr = topOrigins.map(o => `'${o}'`).join(',');

     // 2. Get Matrix Data (Origin x Hour)
     const matrixSql = `
        ${COMMON_CTES(map, terminal)}
        ${pracaFilterCalc.cte}
        SELECT 
            origem,
            hour(peso_saida) as h,
            AVG(ciclo_total_h) as avg_val,
            COUNT(DISTINCT gmo_id) as vol
        FROM calc
        ${pracaFilterCalc.join}
        WHERE terminal = '${terminal}'
          ${dateFilterClause}
          ${produtoFilterCalc}
          AND origem IN (${originListStr})
          AND ciclo_total_h IS NOT NULL
          AND ciclo_total_h > 0
        GROUP BY origem, hour(peso_saida)
     `;
     
     const matrixRes = await runQuery(matrixSql);
     
     // 3. Initialize Matrix [Origin][Hour]
     // matrix[i][j] where i = origin index, j = hour index (0..23)
     const avgMatrix = Array.from({length: topOrigins.length}, () => Array(24).fill(0));
     const volMatrix = Array.from({length: topOrigins.length}, () => Array(24).fill(0));
     
     if (matrixRes && matrixRes.Rows && matrixRes.Rows.length > 1) {
         const rows = matrixRes.Rows.slice(1);
         for(const r of rows) {
             const orig = r.Data[0].VarCharValue;
             const h = parseInt(r.Data[1].VarCharValue);
             const avg = parseFloat(r.Data[2].VarCharValue || '0');
             const vol = parseInt(r.Data[3].VarCharValue || '0');
             
             const originIdx = topOrigins.indexOf(orig);
             if (originIdx >= 0 && h >= 0 && h < 24) {
                 avgMatrix[originIdx][h] = avg;
                 volMatrix[originIdx][h] = vol;
             }
         }
     }
     
     return Response.json({
         hours: Array.from({length: 24}, (_, i) => String(i).padStart(2,'0')),
         origins: topOrigins,
         matrix: avgMatrix,
         volume_matrix: volMatrix
     });

  } catch (err: any) {
      console.error(err);
      return Response.json({ error: err.message }, { status: 500 });
  }
}
