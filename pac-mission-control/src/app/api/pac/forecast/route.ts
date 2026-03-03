import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const produto: string | null = searchParams.get('produto');
    const praca: string | null = searchParams.get('praca');

    const TARGET_VIEW: string = ATHENA_VIEW;

    const rawCols = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || []);
    
    const map: Record<string, string> = getCleanMap(rawCols);
    
    // Additional dynamic mappings for movement and granular status
    const colMovimento = rawCols.find(c => ['MOVIMENTO', 'DS_MOVIMENTO', 'TIPO_MOVIMENTO'].includes(c.toUpperCase()));
    const colOperacao = rawCols.find(c => ['OPERACAO', 'DS_OPERACAO', 'TIPO_OPERACAO'].includes(c.toUpperCase()));
    const colSituacao = map.situacao || 'DS_SITUACAO';

    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';
    
    // User requested focus on DESCARGA
    const movementFilter = '';
    /* 
    if (colMovimento && colOperacao) {
      movementFilter = `AND (base.${colMovimento} = 'DESCARGA' OR base.${colOperacao} = 'DESCARGA')`;
    } else if (colMovimento) {
      movementFilter = `AND base.${colMovimento} = 'DESCARGA'`;
    } else if (colOperacao) {
      movementFilter = `AND base.${colOperacao} = 'DESCARGA'`;
    }
    */
    console.log(`[Forecast-Debug] Filters: Movement=${movementFilter} Terminal=${terminal} Producto=${produto}`);

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
            ${colSituacao} as _col_situacao,
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
            ${movementFilter}
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
              WHEN _col_chegada IS NOT NULL THEN 
                CASE 
                   WHEN _col_situacao LIKE '%DESCARGA%' THEN 'Em Descarga'
                   WHEN _col_situacao LIKE '%PESAGEM%' OR _col_situacao LIKE '%BALANCA%' THEN 'Aguardando Balança'
                   ELSE 'Fim Operação'
                END
              WHEN _col_chamada IS NOT NULL THEN 'Em Trânsito Interno'
              WHEN _col_cheguei IS NOT NULL THEN 'No Pátio'
              ELSE 'Programado'
            END as status_operacional,
            date_diff('second', coalesce(try_cast(_col_chegada as timestamp), try_cast(_col_chamada as timestamp), try_cast(_col_cheguei as timestamp), try_cast(_col_agendamento as timestamp)), now()) / 3600.0 as tempo_status_h
          FROM dedupped
          WHERE (try_cast(_col_peso_saida as timestamp) IS NULL OR coalesce(cast(_col_peso_saida as varchar), '') = '')
            AND (
              (_col_cheguei is not null AND try_cast(_col_cheguei as timestamp) >= date_add('day', -30, now()))
              OR 
              (_col_agendamento is not null AND try_cast(_col_agendamento as timestamp) >= date_trunc('day', now()))
              OR
              (_col_chegada is not null AND try_cast(_col_chegada as timestamp) >= date_add('day', -30, now()))
            )
      ),
      benchmarks AS (
          SELECT 'No Pátio' as status_operacional, 2.0 as avg_hist_h
          UNION ALL SELECT 'Em Trânsito Interno', 0.5
          UNION ALL SELECT 'Aguardando Balança', 1.0
          UNION ALL SELECT 'Em Descarga', 2.5
          UNION ALL SELECT 'Fim Operação', 0.5
          UNION ALL SELECT 'Programado', 0.0
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
          WHEN 'Aguardando Balança' THEN 4
          WHEN 'Em Descarga' THEN 5
          WHEN 'Fim Operação' THEN 6
        END`;

    const [summaryResults, vehiclesResults]: [ResultSet | undefined, ResultSet | undefined] = await Promise.all([
      runQuery(summaryQuery),
      runQuery(`
        ${pracaFilter.cte}
        ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
            SELECT 
              ${map.id} as id, ${map.placa} as placa, ${map.origem} as origem, 
              ${map.dt_cheguei} as ch, ${map.dt_chamada} as cda, ${map.dt_chegada} as cga, 
              ${map.dt_agendamento} as ag, ${map.dt_peso_saida} as ps,
              ${colSituacao} as sit
            FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
            ${pracaFilter.join}
            WHERE base.${map.terminal} = '${terminal}' ${produtoFilter} ${movementFilter}
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
            WHEN try_cast(cga as timestamp) IS NOT NULL THEN 
              CASE 
                WHEN sit LIKE '%DESCARGA%' THEN 'Em Descarga'
                WHEN sit LIKE '%PESAGEM%' OR sit LIKE '%BALANCA%' THEN 'Aguardando Balança'
                ELSE 'Fim Operação'
              END
            WHEN try_cast(cda as timestamp) IS NOT NULL THEN 'Em Trânsito Interno'
            WHEN try_cast(ch as timestamp) IS NOT NULL THEN 'No Pátio'
            ELSE 'Programado'
          END as status,
          date_diff('second', coalesce(try_cast(cga as timestamp), try_cast(cda as timestamp), try_cast(ch as timestamp), try_cast(ag as timestamp)), now()) / 3600.0 as horas
        FROM dedup
        WHERE (try_cast(ps as timestamp) IS NULL OR coalesce(cast(ps as varchar), '') = '')
          AND (
            (ch is not null AND try_cast(ch as timestamp) >= date_add('day', -30, now()))
            OR 
            (ag is not null AND try_cast(ag as timestamp) >= date_trunc('day', now()))
            OR
            (cga is not null AND try_cast(cga as timestamp) >= date_add('day', -30, now()))
          )
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

    console.log(`[Forecast-Debug] Final Results: SummaryCount=${summary.length} VehiclesCount=${vehicles.length}`);

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
