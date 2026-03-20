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
    const praca: string | null = searchParams.get('praca') || 'TODAS';

    // Get current date for BR
    const now = new Date();
    const todayStr: string = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
    const [y, m, d_part]: string[] = todayStr.split('-');

    const cacheKey = `pac_diag_rca_export_today_v2_${terminal}_${produto || 'all'}_${praca || 'all'}_${todayStr}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    const rawCols: string[] = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || []);
    
    const map: Record<string, string> = getCleanMap(rawCols);
    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter: string = produto ? `AND base.${map.produto} = '${produto}'` : '';

    const exportQuery: string = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
          SELECT 
            ${map.id} as gmo_id,
            ${map.placa} as placa,
            ${map.origem} as origem,
            ${map.produto} as produto,
            COALESCE(${map.cliente || 'cliente'}, 'Desconhecido') as cliente,
            try_cast(${map.dt_emissao} as timestamp) as dt_emissao,
            try_cast(${map.dt_agendamento} as timestamp) as dt_agendamento,
            try_cast(${map.dt_janela || 'dt_janela'} as timestamp) as dt_janela,
            try_cast(${map.dt_cheguei} as timestamp) as dt_cheguei,
            try_cast(${map.dt_chamada} as timestamp) as dt_chamada,
            try_cast(${map.dt_chegada} as timestamp) as dt_chegada,
            try_cast(${map.dt_peso_saida} as timestamp) as dt_peso_saida,
            greatest(
                coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
                coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
            ) as ts_ult
          FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" base
          ${pracaFilter.join}
          WHERE base.${map.terminal} = '${terminal}'
            AND base.ano = ${parseInt(y)} AND base.mes = ${parseInt(m)} AND base.dia = ${parseInt(d_part)}
            AND try_cast(${map.dt_peso_saida} as timestamp) >= timestamp '${todayStr} 00:00:00'
            AND try_cast(${map.dt_peso_saida} as timestamp) <= timestamp '${todayStr} 23:59:59'
            ${produtoFilter}
      ),
      dedupped AS (
          SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn FROM raw_data) WHERE rn = 1
      ),
      metrics AS (
        SELECT 
          *,
          date_diff('second', dt_emissao, dt_peso_saida) / 3600.0 as ciclo_total_h,
          date_diff('second', dt_cheguei, dt_chamada) / 3600.0 as h_verde,
          date_diff('second', dt_chegada, dt_peso_saida) / 3600.0 as h_interno,
          date_diff('second', dt_agendamento, dt_chegada) / 3600.0 as h_viagem,
          date_diff('second', dt_emissao, dt_agendamento) / 3600.0 as h_aguardando
        FROM dedupped
        WHERE dt_peso_saida IS NOT NULL
      )
      SELECT * FROM metrics ORDER BY dt_peso_saida DESC
      LIMIT 20000
    `;

    const results = await runQuery(exportQuery);
    
    const vehiclesExport = (results?.Rows || []).slice(1).map((r: { Data?: any[] }) => {
      const d = r.Data || [];
      const vf = (idx: number) => parseFloat(d[idx]?.VarCharValue || '0');
      
      return {
        'GMO ID': d[0]?.VarCharValue,
        'PLACA': d[1]?.VarCharValue,
        'ORIGEM': d[2]?.VarCharValue,
        'PRODUTO': d[3]?.VarCharValue,
        'CLIENTE': d[4]?.VarCharValue,
        'CICLO TOTAL (H)': parseFloat(vf(13).toFixed(1)),
        'H VERDE': parseFloat(vf(14).toFixed(1)),
        'H INTERNO': parseFloat(vf(15).toFixed(1)),
        'H VIAGEM': parseFloat(vf(16).toFixed(1)),
        'H AGENDAMENTO': parseFloat(vf(17).toFixed(1)),
        'DT EMISSAO': d[5]?.VarCharValue,
        'DT AGENDAMENTO': d[6]?.VarCharValue,
        'DT JANELA': d[7]?.VarCharValue,
        'DT CHEGUEI': d[8]?.VarCharValue,
        'DT CHAMADA': d[9]?.VarCharValue,
        'DT CHEGADA': d[10]?.VarCharValue,
        'DT PESO SAIDA': d[11]?.VarCharValue
      };
    }) || [];

    const response = {
      terminal,
      date: todayStr,
      count: vehiclesExport.length,
      vehicles: vehiclesExport
    };

    setCached(cacheKey, response);
    return NextResponse.json(response);

  } catch (error) {
    console.error("Export Today API Error:", error);
    return NextResponse.json({ error: 'Failed to export today\'s vehicle data' }, { status: 500 });
  }
}
