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

    const TARGET_VIEW: string = 'VW_Ciclo';

    const map: Record<string, string> = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [])
      .then((cols: string[]) => getCleanMap(cols));

    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';

    const query: string = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
          SELECT 
            ${map.id} as _col_id,
            ${map.terminal} as _col_terminal,
            ${map.dt_emissao} as _col_emissao,
            ${map.dt_cheguei} as _col_cheguei,
            ${map.dt_chegada} as _col_chegada,
            ${map.dt_peso_saida} as _col_peso_saida,
            ${map.dt_agendamento} as _col_agendamento,
            greatest(
                coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
                coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00')
            ) as ts_ult
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
          ${pracaFilter.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${produtoFilter}
      ),
      dedupped AS (
          SELECT * FROM (
              SELECT *, row_number() OVER (PARTITION BY _col_id ORDER BY ts_ult DESC) as rn
              FROM raw_data
          ) WHERE rn = 1
      ),
      active_universe AS (
          -- Step 1: Arrived trucks (active) + Scheduled trucks (future)
          SELECT 
            _col_id as gmo_id,
            try_cast(_col_emissao as timestamp) as dt_emissao,
            coalesce(try_cast(_col_cheguei as timestamp), try_cast(_col_agendamento as timestamp)) as dt_queue
          FROM dedupped
          WHERE (_col_cheguei is not null OR _col_agendamento is not null)
            -- Still in terminal or not yet arrived
            AND (try_cast(_col_peso_saida as timestamp) IS NULL OR coalesce(cast(_col_peso_saida as varchar), '') = '')
            -- Limit range (Last 3 days for active, or from today onwards for scheduled)
            AND (
              (_col_cheguei is not null AND try_cast(_col_cheguei as timestamp) >= date_add('day', -3, now()))
              OR 
              (_col_agendamento is not null AND try_cast(_col_agendamento as timestamp) >= date_trunc('day', now()))
            )
      ),
      ranked_queue AS (
          -- Step 2: Order by arrival (already arrived first, then scheduled)
          SELECT 
            *,
            row_number() OVER (ORDER BY dt_queue) as queue_pos
          FROM active_universe
      ),
      projections AS (
          -- Step 3: Shift processing with fixed capacity (72/h)
          SELECT 
            r.gmo_id,
            r.dt_emissao,
            -- Fixed throughput = 72 vehicles / hour
            now() + interval '1' hour * (cast(r.queue_pos as double) / 72.0) as expected_exit,
            (date_diff('second', r.dt_emissao, now()) / 3600.0) + (cast(r.queue_pos as double) / 72.0) as projected_cycle_h
          FROM ranked_queue r
      )
      SELECT 
        date_trunc('hour', expected_exit) as exit_hour,
        avg(projected_cycle_h) as avg_cycle_h,
        max(projected_cycle_h) as max_cycle_h,
        count(*) as truck_count,
        (SELECT count(*) FROM ranked_queue) as total_monitorado
      FROM projections
      GROUP BY 1
      ORDER BY 1`;

    const results: ResultSet | undefined = await runQuery(query);
    const rows = results?.Rows?.slice(1) || [];
    
    const data = rows.map((r: any) => ({
      hour: r.Data[0].VarCharValue,
      avg_cycle_h: parseFloat(r.Data[1].VarCharValue || '0'),
      max_cycle_h: parseFloat(r.Data[2].VarCharValue || '0'),
      truck_count: parseInt(r.Data[3].VarCharValue || '0')
    }));

    const totalMonitorado = rows.length > 0 ? parseInt(rows[0].Data[4].VarCharValue || '0') : 0;

    return NextResponse.json({
      terminal,
      updated_at: new Date().toISOString(),
      capacity_h: 72,
      debug: {
        total_active: totalMonitorado,
        map_cols: map
      },
      forecast: data
    });

  } catch (error) {
    console.error("Forecast API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 });
  }
}
