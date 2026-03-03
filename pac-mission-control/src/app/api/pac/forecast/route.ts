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

    const summaryQuery: string = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
          SELECT 
            ${map.id} as _col_id,
            ${map.terminal} as _col_terminal,
            ${map.dt_emissao} as _col_emissao,
            ${map.dt_cheguei} as _col_cheguei,
            ${map.dt_chegada} as _col_chegada,
            ${map.dt_chamada} as _col_chamada,
            ${map.dt_peso_saida} as _col_peso_saida,
            ${map.dt_agendamento} as _col_agendamento,
            greatest(
                coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
                coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
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
      categorized AS (
          SELECT 
            _col_id,
            CASE 
              WHEN _col_chegada IS NOT NULL THEN 'Em Operação'
              WHEN _col_chamada IS NOT NULL THEN 'Em Trânsito Interno'
              WHEN _col_cheguei IS NOT NULL THEN 'No Pátio'
              ELSE 'Programado'
            END as status_operacional,
            date_diff('second', coalesce(try_cast(_col_chegada as timestamp), try_cast(_col_chamada as timestamp), try_cast(_col_cheguei as timestamp), try_cast(_col_agendamento as timestamp)), now()) / 3600.0 as tempo_status_h
          FROM dedupped
          WHERE (try_cast(_col_peso_saida as timestamp) IS NULL OR coalesce(cast(_col_peso_saida as varchar), '') = '')
            AND (
              (_col_cheguei is not null AND try_cast(_col_cheguei as timestamp) >= date_add('day', -3, now()))
              OR 
              (_col_agendamento is not null AND try_cast(_col_agendamento as timestamp) >= date_trunc('day', now()))
              OR
              (_col_chegada is not null AND try_cast(_col_chegada as timestamp) >= date_add('day', -1, now()))
            )
      ),
      benchmarks AS (
          SELECT 
            'No Pátio' as status_operacional,
            coalesce(avg(date_diff('second', try_cast(_col_cheguei as timestamp), try_cast(_col_chamada as timestamp)) / 3600.0), 2.0) as avg_hist_h
          FROM dedupped WHERE _col_cheguei is not null AND _col_chamada is not null AND try_cast(_col_peso_saida as timestamp) >= date_add('day', -3, now())
          UNION ALL
          SELECT 
            'Em Trânsito Interno',
            coalesce(avg(date_diff('second', try_cast(_col_chamada as timestamp), try_cast(_col_chegada as timestamp)) / 3600.0), 0.5)
          FROM dedupped WHERE _col_chamada is not null AND _col_chegada is not null AND try_cast(_col_peso_saida as timestamp) >= date_add('day', -3, now())
          UNION ALL
          SELECT 
            'Em Operação',
            coalesce(avg(date_diff('second', try_cast(_col_chegada as timestamp), try_cast(_col_peso_saida as timestamp)) / 3600.0), 1.5)
          FROM dedupped WHERE _col_chegada is not null AND _col_peso_saida is not null AND try_cast(_col_peso_saida as timestamp) >= date_add('day', -3, now())
      )
      SELECT 
        c.status_operacional,
        avg(c.tempo_status_h) as avg_atual_h,
        count(*) as volume,
        max(b.avg_hist_h) as avg_hist_h
      FROM categorized c
      LEFT JOIN benchmarks b ON b.status_operacional = c.status_operacional
      GROUP BY 1
      ORDER BY 
        CASE c.status_operacional 
          WHEN 'Programado' THEN 1 
          WHEN 'No Pátio' THEN 2 
          WHEN 'Em Trânsito Interno' THEN 3 
          WHEN 'Em Operação' THEN 4 
        END`;

    const [summaryResults, vehiclesResults]: [ResultSet | undefined, ResultSet | undefined] = await Promise.all([
      runQuery(summaryQuery),
      runQuery(`
        ${pracaFilter.cte}
        ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
            SELECT 
              ${map.id} as id, ${map.placa} as placa, ${map.origem} as origem, 
              ${map.dt_cheguei} as ch, ${map.dt_chamada} as cda, ${map.dt_chegada} as cga, 
              ${map.dt_agendamento} as ag, ${map.dt_peso_saida} as ps
            FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
            ${pracaFilter.join}
            WHERE base.${map.terminal} = '${terminal}' ${produtoFilter}
        ),
        dedup AS (
          SELECT * FROM (
            SELECT *, row_number() OVER (PARTITION BY id ORDER BY greatest(
              coalesce(try_cast(ps as timestamp), timestamp '1900-01-01 00:00:00'),
              coalesce(try_cast(cga as timestamp), timestamp '1900-01-01 00:00:00'),
              coalesce(try_cast(cda as timestamp), timestamp '1900-01-01 00:00:00'),
              coalesce(try_cast(ch as timestamp), timestamp '1900-01-01 00:00:00')
            ) DESC) as rn FROM raw_data
          ) WHERE rn = 1
        )
        SELECT 
          id, placa, origem,
          CASE 
            WHEN try_cast(cga as timestamp) IS NOT NULL THEN 'Em Operação'
            WHEN try_cast(cda as timestamp) IS NOT NULL THEN 'Em Trânsito Interno'
            WHEN try_cast(ch as timestamp) IS NOT NULL THEN 'No Pátio'
            ELSE 'Programado'
          END as status,
          date_diff('second', coalesce(try_cast(cga as timestamp), try_cast(cda as timestamp), try_cast(ch as timestamp), try_cast(ag as timestamp)), now()) / 3600.0 as horas
        FROM dedup
        WHERE (try_cast(ps as timestamp) IS NULL OR coalesce(cast(ps as varchar), '') = '')
        LIMIT 1000
      `)
    ]);

    const summary = summaryResults?.Rows?.slice(1).map((r) => {
      const data = r.Data || [];
      return {
        status: data[0]?.VarCharValue || '',
        avg_atual_h: parseFloat(data[1]?.VarCharValue || '0'),
        volume: parseInt(data[2]?.VarCharValue || '0'),
        avg_hist_h: parseFloat(data[3]?.VarCharValue || '0')
      };
    }) || [];

    const vehicles = vehiclesResults?.Rows?.slice(1).map((r) => {
      const data = r.Data || [];
      return {
        id: data[0]?.VarCharValue || '',
        placa: data[1]?.VarCharValue || '',
        origem: data[2]?.VarCharValue || '',
        status: data[3]?.VarCharValue || '',
        horas: parseFloat(data[4]?.VarCharValue || '0')
      };
    }) || [];

    return NextResponse.json({
      terminal,
      updated_at: new Date().toISOString(),
      summary,
      vehicles
    });

  } catch (error) {
    console.error("Forecast API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch queue analysis' }, { status: 500 });
  }
}
