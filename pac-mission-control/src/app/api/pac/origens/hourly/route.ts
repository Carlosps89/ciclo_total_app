
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
  const origem = sp.get('origem');
  const dateResult = sp.get('date');
  const produto = sp.get('produto');
  const praca = sp.get('praca');
  const debug = sp.get('debug');
  
  if(!origem) return Response.json({error: 'Origem required'}, {status: 400});

  const now = new Date();
  const todayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
  const targetDate = dateResult || todayStr;
  const produtoFilterCalc = produto ? `AND produto = '${produto}'` : '';
  
  const pracaFilterCalc = applyPracaFilter(terminal, praca, 'calc.origem');
  if (pracaFilterCalc.isNoMatch) {
      return Response.json({
          data: Array.from({length: 24}, (_, i) => ({ h: i, p50: 0, vol: 0 })),
          debug_praca_warning: pracaFilterCalc.warning
      });
  }

  try {
      const map = await getSchemaMap();
      const sql = `
        ${COMMON_CTES(map, terminal, '', { start: targetDate, end: targetDate })}
        ${pracaFilterCalc.cte}
        , base AS (
            SELECT 
                hour(peso_saida) as h,
                ciclo_total_h,
                gmo_id
            FROM calc
            ${pracaFilterCalc.join}
            WHERE terminal = '${terminal}'
              AND origem = '${origem}'
              ${produtoFilterCalc}
              AND peso_saida <= from_iso8601_timestamp('${targetDate}T23:59:59-03:00')
              AND ciclo_total_h IS NOT NULL
        )
        SELECT 
            h,
            approx_percentile(ciclo_total_h, 0.5) as p50,
            count(distinct gmo_id) as vol
        FROM base
        GROUP BY h
        ORDER BY h
      `;

     const result = await runQuery(sql);
     const hoursMap = new Map<number, any>();
     
     if (result && result.Rows && result.Rows.length > 1) {
         result.Rows.slice(1).forEach((r: any) => {
             hoursMap.set(parseInt(r.Data[0].VarCharValue), {
                 h: parseInt(r.Data[0].VarCharValue),
                 p50: parseFloat(r.Data[1].VarCharValue),
                 vol: parseInt(r.Data[2].VarCharValue)
             });
         });
     }
     
     const finalData = [];
     for(let i=0; i<24; i++) {
         if(hoursMap.has(i)) finalData.push(hoursMap.get(i));
         else finalData.push({ h: i, p50: 0, vol: 0 });
     }
     
     return Response.json({
         data: finalData
     });
  } catch (e: any) {
      console.error(e);
      return Response.json({ error: e.message }, { status: 500 });
  }
}
