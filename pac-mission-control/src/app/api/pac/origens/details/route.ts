
import { NextRequest } from "next/server";
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from "@/lib/athena";
import { COMMON_CTES, getCleanMap } from "@/lib/athena-sql";
import { VehicleItem } from "@/lib/types";
import { getCached, setCached } from "@/lib/cache";
import { applyPracaFilter } from "@/lib/pracas";

export const dynamic = 'force-dynamic';

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_v3';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) {
        if (!cached.cliente) cached.cliente = 'cliente';
        return cached;
    }
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
  const produtoFilterCalc = produto ? `AND produto = '${produto}'` : '';
  
  if(!origem) return Response.json({error: 'Origem required'}, {status: 400});

  // Timezone logic: All explicit BRT
  // We will build a single query with conditional aggregation for 4 windows:
  // 1. Last Hour (Rolling)
  // 2. Today (Day start to now)
  // 3. Month (Month start to now)
  // 4. Year (Year start to now)

  const pracaFilterCalc = applyPracaFilter(terminal, praca, 'calc.origem');
  if (pracaFilterCalc.isNoMatch) {
      return Response.json({
          origem, terminal, generated_at_brt: new Date().toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"}),
          kpis: { last_hour: { avg_cycle_h: 0, trips: 0 }, today: { avg_cycle_h: 0, trips: 0 }, month: { avg_cycle_h: 0, trips: 0 }, year: { avg_cycle_h: 0, trips: 0 } },
          debug_praca_warning: pracaFilterCalc.warning,
          diagnostics: { definition: "AVG(ciclo_total_h) on completed trips (>0). Vol=COUNT(DISTINCT gmo_id).", time_basis: "peso_saida in BRT", filters: { origem, terminal } }
      });
  }

  try {
      const map = await getSchemaMap();
      const sql = `
        ${COMMON_CTES(map, terminal, '', { range: 'year' })}
        ${pracaFilterCalc.cte}
        , base_filtered AS (
            SELECT 
                ciclo_total_h,
                gmo_id,
                peso_saida
            FROM calc
            ${pracaFilterCalc.join}
            WHERE terminal = '${terminal}'
              AND origem = '${origem}'
              ${produtoFilterCalc}
              AND ciclo_total_h IS NOT NULL 
              AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-01-01 00:00:00') as timestamp)
        )
        SELECT
            -- 1. LAST HOUR (now - 1h TO now)
            avg(CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo' - interval '1' hour, '%Y-%m-%d %H:%i:%s') as timestamp) THEN ciclo_total_h END) as avg_hour,
            count(distinct CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo' - interval '1' hour, '%Y-%m-%d %H:%i:%s') as timestamp) THEN gmo_id END) as vol_hour,

            -- 2. TODAY (start of day TO now)
            avg(CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp) THEN ciclo_total_h END) as avg_today,
            count(distinct CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp) THEN gmo_id END) as vol_today,

            -- 3. MONTH (start of month TO now)
            avg(CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-01 00:00:00') as timestamp) THEN ciclo_total_h END) as avg_month,
            count(distinct CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-01 00:00:00') as timestamp) THEN gmo_id END) as vol_month,

            -- 4. YEAR (start of year TO now)
            avg(CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-01-01 00:00:00') as timestamp) THEN ciclo_total_h END) as avg_year,
            count(distinct CASE WHEN peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-01-01 00:00:00') as timestamp) THEN gmo_id END) as vol_year

        FROM base_filtered
      `;

      const result = await runQuery(sql);
      
      let kpis = {
          last_hour: { avg_cycle_h: 0, trips: 0 },
          today:     { avg_cycle_h: 0, trips: 0 },
          month:     { avg_cycle_h: 0, trips: 0 },
          year:      { avg_cycle_h: 0, trips: 0 }
      };

      if (result && result.Rows && result.Rows.length > 1) {
          const r = result.Rows[1].Data!;
          // output order: avg_hour, vol_hour, avg_today, vol_today, avg_month, vol_month, avg_year, vol_year
          kpis = {
              last_hour: { 
                  avg_cycle_h: parseFloat(r[0].VarCharValue || '0'), 
                  trips: parseInt(r[1].VarCharValue || '0') 
              },
              today: { 
                  avg_cycle_h: parseFloat(r[2].VarCharValue || '0'), 
                  trips: parseInt(r[3].VarCharValue || '0') 
              },
              month: { 
                  avg_cycle_h: parseFloat(r[4].VarCharValue || '0'), 
                  trips: parseInt(r[5].VarCharValue || '0') 
              },
              year: { 
                  avg_cycle_h: parseFloat(r[6].VarCharValue || '0'), 
                  trips: parseInt(r[7].VarCharValue || '0') 
              }
          };
      }

      // 5. FETCH VEHICLES (Today)
      const vehiclesSql = `
        ${COMMON_CTES(map, terminal, '', { range: 'year' })}
        ${pracaFilterCalc.cte}
        SELECT 
            gmo_id,
            placa_tracao,
            origem,
            produto,
            cliente,
            ciclo_total_h,
            area_verde_cheguei_h,
            tempo_interno_h,
            tempo_viagem_h,
            aguardando_agendamento_h,
            dt_emissao,
            dt_agendamento,
            janela_agendamento,
            cheguei,
            dt_chamada,
            dt_chegada,
            peso_saida
        FROM calc
        ${pracaFilterCalc.join}
        WHERE terminal = '${terminal}'
          AND origem = '${origem}'
          ${produtoFilterCalc}
          AND peso_saida >= cast(date_format(current_timestamp AT TIME ZONE 'America/Sao_Paulo', '%Y-%m-%d 00:00:00') as timestamp)
        ORDER BY ciclo_total_h DESC
        LIMIT 100
      `;

      const vRes = await runQuery(vehiclesSql);
      const vehicles: VehicleItem[] = [];
      if (vRes && vRes.Rows && vRes.Rows.length > 1) {
          vRes.Rows.slice(1).forEach((r: any) => {
              const d = r.Data;
              const f = (val: string) => parseFloat(val || '0');
              vehicles.push({
                  gmo_id: d[0]?.VarCharValue || '',
                  placa: d[1]?.VarCharValue || '',
                  origem: d[2]?.VarCharValue || '',
                  produto: d[3]?.VarCharValue || '',
                  cliente: d[4]?.VarCharValue || '',
                  ciclo_total_h: parseFloat(f(d[5]?.VarCharValue).toFixed(1)),
                  h_verde: parseFloat(f(d[6]?.VarCharValue).toFixed(1)),
                  h_interno: parseFloat(f(d[7]?.VarCharValue).toFixed(1)),
                  h_viagem: parseFloat(f(d[8]?.VarCharValue).toFixed(1)),
                  h_aguardando: parseFloat(f(d[9]?.VarCharValue).toFixed(1)),
                  dt_emissao: d[10]?.VarCharValue,
                  dt_agendamento: d[11]?.VarCharValue,
                  dt_janela: d[12]?.VarCharValue,
                  dt_cheguei: d[13]?.VarCharValue,
                  dt_chamada: d[14]?.VarCharValue,
                  dt_chegada: d[15]?.VarCharValue,
                  dt_peso_saida: d[16]?.VarCharValue
              });
          });
      }

      return Response.json({
          origem,
          terminal,
          generated_at_brt: new Date().toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"}),
          kpis,
          vehicles,
          diagnostics: {
              definition: "AVG(ciclo_total_h) on completed trips (>0). Vol=COUNT(DISTINCT gmo_id).",
              time_basis: "peso_saida in BRT",
              filters: { origem, terminal }
          }
      });

  } catch(e: any) {
      console.error(e);
      return Response.json({ error: e.message }, { status: 500 });
  }
}
