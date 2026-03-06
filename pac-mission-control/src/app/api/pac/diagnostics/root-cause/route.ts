import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const produto: string | null = searchParams.get('produto');
    const praca: string | null = searchParams.get('praca');
    const days: number = parseInt(searchParams.get('days') || '30');

    const TARGET_VIEW: string = 'VW_Ciclo';

    const rawCols = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || []);
    
    const map: Record<string, string> = getCleanMap(rawCols);
    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';
    
    // We filter by date if possible, otherwise last N days
    const dateFilter = `AND try_cast(${map.dt_peso_saida} as timestamp) >= date_add('day', -${days}, date_add('hour', -4, now()))`;

    const rcaQuery = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
          SELECT 
            ${map.id} as id,
            ${map.origem} as origem,
            ${map.produto} as produto,
            try_cast(${map.dt_emissao} as timestamp) as dt_em,
            try_cast(${map.dt_agendamento} as timestamp) as dt_ag,
            try_cast(${map.dt_cheguei} as timestamp) as dt_ch,
            try_cast(${map.dt_chamada} as timestamp) as dt_cda,
            try_cast(${map.dt_chegada} as timestamp) as dt_cga,
            try_cast(${map.dt_peso_saida} as timestamp) as dt_ps
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
          ${pracaFilter.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${produtoFilter}
            ${dateFilter}
      ),
      metrics AS (
        SELECT 
          *,
          date_diff('second', dt_em, dt_ps) / 3600.0 as ciclo_total_h,
          date_diff('second', dt_em, dt_ag) / 3600.0 as wait_h,
          date_diff('second', dt_ag, dt_cga) / 3600.0 as travel_h,
          date_diff('second', dt_cga, dt_ps) / 3600.0 as internal_h,
          -- Time dimensions
          extract(month from dt_ps) as month_val,
          extract(day from dt_ps) as day_val,
          extract(hour from dt_ps) as hour_val,
          format_datetime(dt_ps, 'yyyy-MM-dd') as date_str
        FROM raw_data
        WHERE dt_ps IS NOT NULL AND dt_em IS NOT NULL
      ),
      global_stats AS (
        SELECT avg(ciclo_total_h) as global_avg FROM metrics
      ),
      by_origin AS (
        SELECT 
          origem,
          count(*) as volume,
          avg(ciclo_total_h) as avg_ciclo,
          avg(wait_h) as avg_wait,
          avg(travel_h) as avg_travel,
          avg(internal_h) as avg_internal,
          (avg(ciclo_total_h) - (SELECT global_avg FROM global_stats)) * count(*) as impact_score
        FROM metrics
        GROUP BY 1
      ),
      by_product AS (
        SELECT 
          produto,
          count(*) as volume,
          avg(ciclo_total_h) as avg_ciclo,
          (avg(ciclo_total_h) - (SELECT global_avg FROM global_stats)) * count(*) as impact_score
        FROM metrics
        GROUP BY 1
      ),
      by_trend AS (
        SELECT 
          date_str,
          avg(ciclo_total_h) as avg_ciclo,
          avg(wait_h) as avg_wait,
          avg(travel_h) as avg_travel,
          avg(internal_h) as avg_internal,
          count(*) as volume
        FROM metrics
        GROUP BY 1
        ORDER BY 1
      )
      -- This is a complex multi-result query conceptually, 
      -- but Athena usually returns one result set. 
      -- We will split this into separate queries or use UNION ALL with tags if needed.
      -- For simplicity and robustness, we will run the main Pareto by Origin first.
      SELECT 'ORIGIN' as tag, origem as label, volume, avg_ciclo, avg_wait, avg_travel, avg_internal, impact_score FROM by_origin
      UNION ALL
      SELECT 'PRODUCT' as tag, produto as label, volume, avg_ciclo, 0, 0, 0, impact_score FROM by_product
      UNION ALL
      SELECT 'TREND' as tag, date_str as label, volume, avg_ciclo, avg_wait, avg_travel, avg_internal, 0 FROM by_trend
    `;

    const results = await runQuery(rcaQuery);
    
    const data = results?.Rows?.slice(1).map((r: any) => {
      const d = r.Data || [];
      return {
        tag: d[0]?.VarCharValue,
        label: d[1]?.VarCharValue,
        volume: parseInt(d[2]?.VarCharValue || '0'),
        avg_ciclo: parseFloat(d[3]?.VarCharValue || '0'),
        avg_wait: parseFloat(d[4]?.VarCharValue || '0'),
        avg_travel: parseFloat(d[5]?.VarCharValue || '0'),
        avg_internal: parseFloat(d[6]?.VarCharValue || '0'),
        impact: parseFloat(d[7]?.VarCharValue || '0')
      };
    }) || [];

    const response = {
      terminal,
      days,
      origins: data.filter((d: any) => d.tag === 'ORIGIN').sort((a: any, b: any) => b.impact - a.impact),
      products: data.filter((d: any) => d.tag === 'PRODUCT').sort((a: any, b: any) => b.impact - a.impact),
      trends: data.filter((d: any) => d.tag === 'TREND')
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("RCA API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch RCA diagnostics' }, { status: 500 });
  }
}
