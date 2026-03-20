import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const produto: string | null = searchParams.get('produto');
    const praca: string | null = searchParams.get('praca');
    const days: number = parseInt(searchParams.get('days') || '30');

    const cacheKey = `pac_diag_rca_export_v2_${terminal}_${produto || 'all'}_${praca || 'all'}_${days}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    const TARGET_VIEW: string = ATHENA_VIEW || 'VW_Ciclo';

    const rawCols = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || []);
    
    const map: Record<string, string> = getCleanMap(rawCols);
    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';
    const dateFilter = `AND try_cast(${map.dt_peso_saida} as timestamp) >= date_add('day', -${days}, date_add('hour', -4, now()))`;

    const exportQuery = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
          SELECT 
            ${map.id} as gmo_id,
            ${map.placa} as placa,
            ${map.origem} as origem,
            ${map.produto} as produto,
            ${map.dt_emissao} as dt_emissao,
            ${map.dt_agendamento} as dt_agendamento,
            ${map.dt_cheguei} as dt_cheguei,
            ${map.dt_chamada} as dt_chamada,
            ${map.dt_chegada} as dt_chegada,
            ${map.dt_peso_saida} as dt_peso_saida,
            ${map.janela_agendamento || 'janela_agendamento'} as janela,
            greatest(
                coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
                coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
            ) as ts_ult
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
          ${pracaFilter.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${produtoFilter}
            ${dateFilter}
      ),
      dedupped AS (
          SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn FROM raw_data) WHERE rn = 1
      ),
      metrics AS (
        SELECT 
          *,
          date_diff('second', try_cast(dt_emissao as timestamp), try_cast(dt_peso_saida as timestamp)) / 3600.0 as ciclo_total_h,
          date_diff('second', try_cast(dt_emissao as timestamp), try_cast(dt_agendamento as timestamp)) / 3600.0 as espera_agendamento_h,
          date_diff('second', try_cast(dt_agendamento as timestamp), try_cast(dt_chegada as timestamp)) / 3600.0 as tempo_viagem_h,
          date_diff('second', try_cast(dt_chegada as timestamp), try_cast(dt_peso_saida as timestamp)) / 3600.0 as tempo_interno_h
        FROM dedupped
        WHERE dt_peso_saida IS NOT NULL
      )
      SELECT * FROM metrics ORDER BY dt_peso_saida DESC
      LIMIT 20000
    `;

    const results = await runQuery(exportQuery);
    
    const vehicles = results?.Rows?.slice(1).map((r: any) => {
      const d: any = r.Data || [];
      return {
        gmo_id: d[0]?.VarCharValue,
        placa: d[1]?.VarCharValue,
        origem: d[2]?.VarCharValue,
        produto: d[3]?.VarCharValue,
        dt_emissao: d[4]?.VarCharValue,
        dt_agendamento: d[5]?.VarCharValue,
        dt_cheguei: d[6]?.VarCharValue,
        dt_chamada: d[7]?.VarCharValue,
        dt_chegada: d[8]?.VarCharValue,
        dt_peso_saida: d[9]?.VarCharValue,
        janela: d[10]?.VarCharValue,
        ciclo_total_h: parseFloat(d[13]?.VarCharValue || '0'),
        espera_agendamento_h: parseFloat(d[14]?.VarCharValue || '0'),
        tempo_viagem_h: parseFloat(d[15]?.VarCharValue || '0'),
        tempo_interno_h: parseFloat(d[16]?.VarCharValue || '0')
      };
    }) || [];

    const response = {
      terminal,
      days,
      count: vehicles.length,
      vehicles
    };

    setCached(cacheKey, response);
    return NextResponse.json(response);

  } catch (error) {
    console.error("Export API Error:", error);
    return NextResponse.json({ error: 'Failed to export vehicle data' }, { status: 500 });
  }
}
