import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE, getAthenaView, getSchemaMap } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const terminal = searchParams.get('terminal') || 'TRO';
    const hourTimestamp = searchParams.get('hourTimestamp'); // ex: 2026-03-11 14:00:00.000
    const produto = searchParams.get('produto');

    if (!hourTimestamp) {
      return NextResponse.json({ error: 'Missing hourTimestamp parameter' }, { status: 400 });
    }

    const cacheKey = `pac_diag_aging_drilldown_v2_${terminal}_${hourTimestamp}_${produto || 'all'}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    const TARGET_VIEW = getAthenaView();
    const isCleanData = TARGET_VIEW === 'pac_clean_data';
    const map = await getSchemaMap(TARGET_VIEW);

    const extraFilters = produto ? `AND ${map.produto} = '${produto}'` : '';
    
    // The timeframe is strictly within the hour defined by hourTimestamp
    const dateFilter = `
      AND date_trunc('hour', try_cast(base.${map.janela_agendamento} as timestamp)) = timestamp '${hourTimestamp}'
    `;

    const query = `
      WITH raw_data AS (
        SELECT 
            ${map.id} as gmo_id,
            ${map.placa} as placa_tracao,
            base.${map.terminal} as terminal,
            ${map.produto} as produto,
            coalesce(${map.origem}, 'N/A') as origem,
            try_cast(${map.dt_emissao} as timestamp) as dt_em,
            try_cast(${map.dt_agendamento} as timestamp) as dt_ag,
            try_cast(${map.janela_agendamento} as timestamp) as dt_ja,
            row_number() OVER (PARTITION BY ${map.id} ORDER BY coalesce(try_cast(${map.dt_peso_saida} as timestamp), try_cast(${map.dt_chegada} as timestamp), try_cast(${map.dt_chamada} as timestamp), try_cast(${map.dt_cheguei} as timestamp), try_cast(${map.dt_agendamento} as timestamp)) DESC) as rn
        FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
        WHERE (base.${map.terminal} = '${terminal}' OR (base.${map.terminal} IS NULL AND '${terminal}' = 'TRO'))
          ${extraFilters}
          ${dateFilter}
          AND try_cast(${map.dt_emissao} as timestamp) IS NOT NULL
          AND try_cast(${map.dt_agendamento} as timestamp) IS NOT NULL
      ),
      dedupped AS (
          SELECT * FROM raw_data WHERE rn = 1
      )
      SELECT 
        gmo_id,
        placa_tracao,
        origem,
        terminal,
        produto,
        format_datetime(dt_em, 'dd/MM HH:mm') as dt_emissao_fmt,
        format_datetime(dt_ag, 'dd/MM HH:mm') as dt_agendamento_fmt,
        cast(dt_em as varchar) as dt_emissao,
        cast(dt_ag as varchar) as dt_agendamento,
        date_diff('second', dt_em, dt_ag) / 3600.0 as gap_hours,
        date_diff('second', dt_em, dt_ag) / 86400.0 as gap_days
      FROM dedupped
      ORDER BY gap_hours DESC
      LIMIT 200
    `;

    const result = await runQuery(query);
    
    const vehicles = (result?.Rows?.slice(1) || []).map((row: any) => {
      const d = row.Data || [];
      return {
        gmo_id: d[0].VarCharValue || '',
        placa_tracao: d[1].VarCharValue || '',
        origem: d[2].VarCharValue || '',
        terminal: d[3].VarCharValue || '',
        produto: d[4].VarCharValue || '',
        dt_emissao_fmt: d[5].VarCharValue || '',
        dt_agendamento_fmt: d[6].VarCharValue || '',
        dt_emissao: d[7].VarCharValue || '',
        dt_agendamento: d[8].VarCharValue || '',
        gap_hours: parseFloat(d[9].VarCharValue || '0'),
        gap_days: parseFloat(d[10].VarCharValue || '0')
      };
    });

    const response = { vehicles };
    setCached(cacheKey, response);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Aging Drilldown API]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
