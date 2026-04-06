import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE, getAthenaView, getSchemaMap } from '@/lib/athena';
import { getCleanMap, COMMON_CTES } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { ResultSet } from '@aws-sdk/client-athena';

const CACHE_TTL: number = 15 * 60 * 1000; // 15 minutes

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const terminal = searchParams.get('terminal') || 'TRO';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const slaDays = parseInt(searchParams.get('slaDays') || '5', 10);
    const produto = searchParams.get('produto');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Missing date parameters' }, { status: 400 });
    }

    const cacheKey = `pac_diag_aging_v2_${terminal}_${produto || 'all'}_${startDate}_${endDate}_${slaDays}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    const TARGET_VIEW = getAthenaView();
    const isCleanData = TARGET_VIEW === 'pac_clean_data';
    const map = await getSchemaMap(TARGET_VIEW);

    const extraFilters = produto ? `AND ${map.produto} = '${produto}'` : '';
    
    // We only care about trucks that have NOT finished yet (dt_peso_saida is null or dt_chegada is null)
    // Actually, the user wants "veiculos que estao registrados no sistema, a partir do evento Programado, aguardando agendamento a mais de 5 dias"
    // He corrected: "a data do agendamento normalmente estara no passado, porque é a data de criação. Este grafico vai medir o tempo medio de Criação de agendamento (Dt Emissao x Dt agendamento)".
    // So we just measure the gap `dt_emissao` -> `dt_agendamento`, grouping by `dt_agendamento`.
    // It's a historical analysis of the faturamento gap based on when the appointment was created.
    // Let me revise the query.

    const dateFilter = `
      AND try_cast(base.${map.janela_agendamento} as timestamp) >= timestamp '${startDate} 00:00:00'
      AND try_cast(base.${map.janela_agendamento} as timestamp) <= timestamp '${endDate} 23:59:59'
    `;

    const pracaFilter = ``;

    const query = `
      WITH raw_data AS (
        SELECT 
            ${map.id} as id,
            try_cast(${map.dt_emissao} as timestamp) as dt_em,
            try_cast(${map.dt_agendamento} as timestamp) as dt_ag,
            try_cast(${map.janela_agendamento} as timestamp) as dt_ja_raw,
            ${isCleanData ? '1 as rn' : `row_number() OVER (PARTITION BY ${map.id} ORDER BY coalesce(try_cast(${map.dt_peso_saida} as timestamp), try_cast(${map.dt_chegada} as timestamp), try_cast(${map.dt_chamada} as timestamp), try_cast(${map.dt_cheguei} as timestamp), try_cast(${map.dt_agendamento} as timestamp)) DESC) as rn`}
        FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
        WHERE (base.${map.terminal} = '${terminal}' OR (base.${map.terminal} IS NULL AND '${terminal}' = 'TRO'))
          ${isCleanData ? `AND dt IN ('ACTIVE', 
              format_datetime(date_add('day', -1, now()), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -2, now()), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -3, now()), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -4, now()), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -5, now()), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -6, now()), 'yyyy-MM-dd'),
              format_datetime(now(), 'yyyy-MM-dd')
          )` : ''}
          ${extraFilters}
          ${dateFilter}
          AND try_cast(${map.dt_emissao} as timestamp) IS NOT NULL
          AND try_cast(${map.dt_agendamento} as timestamp) IS NOT NULL
      ),
      dedupped AS (
          SELECT * FROM raw_data WHERE rn = 1
      ),
      metrics AS (
          SELECT 
            id,
            dt_em,
            dt_ag,
            dt_ja_raw as dt_ja,
            date_diff('second', dt_em, dt_ag) / 3600.0 as gap_hours,
            date_diff('second', dt_em, dt_ag) / 86400.0 as gap_days,
            date_trunc('hour', dt_ja_raw) as bucket_time
          FROM dedupped
      ),
      aggregated AS (
          SELECT 
            bucket_time,
            format_datetime(bucket_time, 'dd/MM HH:00') as bucket_label,
            count(distinct id) as volume,
            avg(gap_hours) as avg_gap_h,
            max(gap_days) as max_gap_days,
            count(distinct CASE WHEN gap_days >= ${slaDays} THEN id END) as offender_count,
            avg(CASE WHEN gap_days >= ${slaDays} THEN gap_hours END) as avg_offender_gap_h
          FROM metrics
          GROUP BY 1, 2
      )
      SELECT 
        *,
        CASE WHEN max_gap_days >= ${slaDays} THEN 1 ELSE 0 END as has_sla_breach
      FROM aggregated
      ORDER BY bucket_time ASC
    `;

    const result = await runQuery(query);
    
    const chartData = (result?.Rows?.slice(1) || []).map((row: any) => {
      const d = row.Data || [];
      return {
        bucket_time: d[0].VarCharValue || '',
        bucket_label: d[1].VarCharValue || '',
        volume: parseInt(d[2].VarCharValue || '0', 10),
        avg_gap_h: parseFloat(d[3].VarCharValue || '0'),
        max_gap_days: parseFloat(d[4].VarCharValue || '0'),
        offender_count: parseInt(d[5].VarCharValue || '0', 10),
        avg_offender_gap_h: parseFloat(d[6].VarCharValue || '0'),
        has_sla_breach: (d[7].VarCharValue || '0') === '1'
      };
    });

    const response = { buckets: chartData };
    setCached(cacheKey, response, CACHE_TTL);
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Aging API]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
