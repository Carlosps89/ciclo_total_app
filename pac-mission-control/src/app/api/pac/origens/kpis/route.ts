
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
  const produto = sp.get('produto');
  const praca = sp.get('praca');
  const debug = sp.get('debug');
  
  if(!origem) return Response.json({error: 'Origem required'}, {status: 400});

  const produtoFilterCalc = produto ? `AND produto = '${produto}'` : '';
  
  const pracaFilterCalc = applyPracaFilter(terminal, praca, 'calc.origem');
  if (pracaFilterCalc.isNoMatch) {
      return Response.json({
          data: {},
          debug_praca_warning: pracaFilterCalc.warning
      });
  }
  
  try {
      const map = await getSchemaMap();
      const sql = `
        ${COMMON_CTES(map, terminal, '', { range: 'year' })}
        ${pracaFilterCalc.cte}
        SELECT
          -- ANO
          avg(ciclo_total_h) as avg_ano,
          count(distinct gmo_id) as vol_ano,
          
          -- MES
          avg(CASE WHEN date_trunc('month', peso_saida) = cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-01 00:00:00') as timestamp) THEN ciclo_total_h END) as avg_mes,
          count(distinct CASE WHEN date_trunc('month', peso_saida) = cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-01 00:00:00') as timestamp) THEN gmo_id END) as vol_mes,

          -- DIA
          avg(CASE WHEN date_trunc('day', peso_saida) = cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp) THEN ciclo_total_h END) as avg_dia,
          count(distinct CASE WHEN date_trunc('day', peso_saida) = cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp) THEN gmo_id END) as vol_dia,

          -- HORA (Latest closed hour)
          -- logic: current_timestamp - 1 hour, truncated
          avg(CASE WHEN date_trunc('hour', peso_saida) = cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo' - interval '1' hour, '%Y-%m-%d %H:00:00') as timestamp) THEN ciclo_total_h END) as avg_hora,
          count(distinct CASE WHEN date_trunc('hour', peso_saida) = cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo' - interval '1' hour, '%Y-%m-%d %H:00:00') as timestamp) THEN gmo_id END) as vol_hora

        FROM calc
        ${pracaFilterCalc.join}
        WHERE terminal = '${terminal}'
          AND origem = '${origem}'
          ${produtoFilterCalc}
          AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-01-01 00:00:00') as timestamp)
      `;

      const result = await runQuery(sql);
      let data = {};
      if (result && result.Rows && result.Rows.length > 1) {
          const r = result.Rows[1].Data;
          data = {
              ano: { avg: parseFloat(r[0].VarCharValue || '0'), vol: parseInt(r[1].VarCharValue || '0') },
              mes: { avg: parseFloat(r[2].VarCharValue || '0'), vol: parseInt(r[3].VarCharValue || '0') },
              dia: { avg: parseFloat(r[4].VarCharValue || '0'), vol: parseInt(r[5].VarCharValue || '0') },
              hora: { avg: parseFloat(r[6].VarCharValue || '0'), vol: parseInt(r[7].VarCharValue || '0') },
          };
      }
      return Response.json({
          data
      });
  } catch(e: any) {
      console.error(e);
      return Response.json({ error: e.message }, { status: 500 });
  }
}
