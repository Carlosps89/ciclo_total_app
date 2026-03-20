
import { NextRequest } from 'next/server';
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW, getSchemaMap } from '@/lib/athena';
import { COMMON_CTES, getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';

export const dynamic = 'force-dynamic';

// Usando getSchemaMap global de @/lib/athena

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const terminal = searchParams.get('terminal') || 'TRO';
  const dateResult = searchParams.get('date'); // YYYY-MM-DD (optional)
  const produto = searchParams.get('produto');
  const praca = searchParams.get('praca');
  const debug = searchParams.get('debug');

  // TIMEZONE LOGIC: "America/Sao_Paulo"
  // If date is provided, constructs boundary in BRT.
  // If NOT provided, uses "current_date at time zone 'America/Sao_Paulo'"
  
  // Safe Date Constraint
  let dateFilterClause = '';
  if (dateResult) {
      // User provided date
      dateFilterClause = `
          AND peso_saida >= cast('${dateResult} 00:00:00' as timestamp)
          AND peso_saida <  cast('${dateResult} 00:00:00' as timestamp) + interval '1' day
      `;
  } else {
      // Default: "Today" in BRT
      dateFilterClause = `
          AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp)
          AND peso_saida <  cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp) + interval '1' day
      `;
  }
  const produtoFilterCalc = produto ? `AND produto = '${produto}'` : '';
  
  const pracaFilter = applyPracaFilter(terminal, praca);
  if (pracaFilter.isNoMatch) {
      return Response.json({
          data: Array.from({ length: 24 }).map((_, i) => ({ h: i, p50: 0, p90: 0, avg: 0, vol: 0 })),
          debug_praca_warning: pracaFilter.warning
      });
  }
  
  try {
     // CACHE LAYER (15 min)
     const CACHE_KEY = `pac_ciclo_hourly_v2_${terminal}_${produto || 'all'}_${praca || 'all'}_${dateResult || 'today'}`;
     const cachedData = getCached<any>(CACHE_KEY);
     if (cachedData) {
         return Response.json(cachedData);
     }

     const map = await getSchemaMap();
     
     const query = `
        ${COMMON_CTES(map, terminal)}
        ${pracaFilter.cte}
        , base AS (
            SELECT 
                hour(peso_saida) as h,
                ciclo_total_h,
                gmo_id
            FROM calc
            ${pracaFilter.join}
            WHERE terminal = '${terminal}'
              ${dateFilterClause}
              ${produtoFilterCalc}
              AND ciclo_total_h IS NOT NULL
        )
        SELECT 
            h,
            approx_percentile(ciclo_total_h, 0.5) as p50,
            approx_percentile(ciclo_total_h, 0.9) as p90,
            avg(ciclo_total_h) as avg_val,
            count(distinct gmo_id) as vol
        FROM base
        GROUP BY h
        ORDER BY h
     `;

     const result = await runQuery(query);
     const hoursMap = new Map<number, any>();
     
     if (result && result.Rows && result.Rows.length > 1) {
         const rows = result.Rows.slice(1);
         rows.forEach((r: any) => {
             const h = parseInt(r.Data[0].VarCharValue);
             const p50 = parseFloat(r.Data[1].VarCharValue);
             const p90 = parseFloat(r.Data[2].VarCharValue);
             const avg = parseFloat(r.Data[3].VarCharValue);
             const vol = parseInt(r.Data[4].VarCharValue);
             
             hoursMap.set(h, { h, p50, p90, avg, vol });
         });
     }
     
     const finalData = [];
     for(let i=0; i<24; i++) {
         if (hoursMap.has(i)) {
             finalData.push(hoursMap.get(i));
         } else {
             // Fill 0
             finalData.push({ 
                 h: i, 
                 p50: 0, 
                 p90: 0, 
                 avg: 0, 
                 vol: 0 
             });
         }
     }
     
     const response = {
         data: finalData
     };

     // Set Cache (15 min)
     setCached(CACHE_KEY, response, 15 * 60 * 1000);
     
     return Response.json(response);
     
  } catch (err: any) {
      console.error(err);
      return Response.json({ error: err.message }, { status: 500 });
  }
}
