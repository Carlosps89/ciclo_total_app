import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const produto: string | null = searchParams.get('produto');
    const praca: string | null = searchParams.get('praca');

    const map: Record<string, string> = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [])
      .then((cols: string[]) => getCleanMap(cols));

    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';

    const query: string = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} stage_averages AS (
          SELECT 
            coalesce(avg(date_diff('second', try_cast(${map.dt_cheguei} as timestamp), try_cast(${map.dt_chegada} as timestamp)) / 3600.0), 2.0) as avg_cheguei_to_chegada,
            coalesce(avg(date_diff('second', try_cast(${map.dt_chegada} as timestamp), try_cast(${map.dt_peso_saida} as timestamp)) / 3600.0), 1.5) as avg_chegada_to_saida
          FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" base
          ${pracaFilter.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${produtoFilter}
            AND try_cast(${map.dt_peso_saida} as timestamp) >= date_add('day', -3, now())
      ),
      active_trucks AS (
          SELECT 
            ${map.id} as gmo_id,
            try_cast(${map.dt_emissao} as timestamp) as dt_emissao,
            try_cast(${map.dt_cheguei} as timestamp) as dt_cheguei,
            try_cast(${map.dt_chegada} as timestamp) as dt_chegada
          FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" base
          ${pracaFilter.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${produtoFilter}
            AND try_cast(${map.dt_cheguei} as timestamp) >= date_add('day', -7, now())
            AND (try_cast(${map.dt_peso_saida} as timestamp) IS NULL OR coalesce(cast(${map.dt_peso_saida} as varchar), '') = '')
      ),
      projections AS (
          SELECT 
            t.gmo_id,
            t.dt_emissao,
            CASE 
              WHEN t.dt_chegada IS NULL THEN now() + interval '1' hour * (s.avg_cheguei_to_chegada + s.avg_chegada_to_saida)
              ELSE now() + interval '1' hour * s.avg_chegada_to_saida
            END as expected_exit,
            CASE 
              WHEN t.dt_chegada IS NULL THEN (date_diff('second', t.dt_emissao, now()) / 3600.0) + s.avg_cheguei_to_chegada + s.avg_chegada_to_saida
              ELSE (date_diff('second', t.dt_emissao, now()) / 3600.0) + s.avg_chegada_to_saida
            END as projected_cycle_h
          FROM active_trucks t
          CROSS JOIN stage_averages s
      ),
      stats AS (
          SELECT
            (SELECT count(*) FROM active_trucks) as count_active,
            (SELECT count(*) FROM projections) as count_projections,
            (SELECT avg_cheguei_to_chegada FROM stage_averages) as avg_wait,
            (SELECT avg_chegada_to_saida FROM stage_averages) as avg_internal
      )
      SELECT 
        date_trunc('hour', expected_exit) as exit_hour,
        avg(projected_cycle_h) as avg_cycle_h,
        count(*) as truck_count,
        (SELECT count_active FROM stats) as total_active,
        (SELECT avg_wait FROM stats) as debug_avg_wait
      FROM projections
      GROUP BY 1, 4, 5
      ORDER BY 1
    `;

    const results: ResultSet | undefined = await runQuery(query);
    const rows = results?.Rows?.slice(1) || [];
    
    const data = rows.map((r: any) => ({
      hour: r.Data[0].VarCharValue,
      avg_cycle_h: parseFloat(r.Data[1].VarCharValue || '0'),
      truck_count: parseInt(r.Data[2].VarCharValue || '0')
    }));

    const totalActive = rows.length > 0 ? parseInt(rows[0].Data[3].VarCharValue || '0') : 0;
    const debugAvgWait = rows.length > 0 ? parseFloat(rows[0].Data[4].VarCharValue || '0') : 0;

    return NextResponse.json({
      terminal,
      updated_at: new Date().toISOString(),
      debug: {
        total_active: totalActive,
        avg_wait_used: debugAvgWait,
        map_cols: map
      },
      forecast: data
    });

  } catch (error) {
    console.error("Forecast API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 });
  }
}
