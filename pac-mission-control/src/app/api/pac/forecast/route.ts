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
      terminal_stats AS (
          -- Step 1: Calculate historical throughput (vazao): trucks/hour in the last 3 days
          SELECT 
            -- We avoid division by zero and provide a sane default (e.g. 10 trucks/hour)
            coalesce(count(*) / nullif(date_diff('hour', date_add('day', -3, now()), now()), 0), 10.0) as throughput_per_hour
          FROM dedupped
          WHERE try_cast(_col_peso_saida as timestamp) >= date_add('day', -3, now())
      ),
      active_trucks AS (
          -- Step 2: Get active trucks ranked by arrival
          SELECT 
            _col_id as gmo_id,
            try_cast(_col_emissao as timestamp) as dt_emissao,
            row_number() OVER (ORDER BY coalesce(try_cast(_col_cheguei as timestamp), try_cast(_col_emissao as timestamp))) as queue_pos
          FROM dedupped
          WHERE (try_cast(_col_peso_saida as timestamp) IS NULL OR coalesce(cast(_col_peso_saida as varchar), '') = '')
            AND try_cast(_col_cheguei as timestamp) >= date_add('day', -7, now())
      ),
      projections AS (
          -- Step 3: Project exit time based on queue position and throughput
          -- Estimated Exit = Now + (Queue_Position / Throughput)
          SELECT 
            t.gmo_id,
            t.dt_emissao,
            now() + interval '1' hour * (cast(t.queue_pos as double) / s.throughput_per_hour) as expected_exit,
            (date_diff('second', t.dt_emissao, now()) / 3600.0) + (cast(t.queue_pos as double) / s.throughput_per_hour) as projected_cycle_h
          FROM active_trucks t
          CROSS JOIN terminal_stats s
      )
      SELECT 
        date_trunc('hour', expected_exit) as exit_hour,
        avg(projected_cycle_h) as avg_cycle_h,
        count(*) as truck_count,
        (SELECT count(*) FROM active_trucks) as total_active,
        (SELECT throughput_per_hour FROM terminal_stats) as debug_throughput
      FROM projections
      GROUP BY 1
      ORDER BY 1`;

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
