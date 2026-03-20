import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const produto: string | null = searchParams.get('produto');
    const praca: string | null = searchParams.get('praca');
    const days: number = parseInt(searchParams.get('days') || '30');

    const cacheKey = `pac_diag_systemic_v2_${terminal}_${produto || 'all'}_${praca || 'all'}_${days}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    const TARGET_VIEW: string = 'VW_Ciclo';

    const rawCols = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || []);
    
    const map: Record<string, string> = getCleanMap(rawCols);
    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';
    
    // Configurar as variáveis de data. O coalesce protege caso não exista dt_janela.
    const dt_janela = map.dt_janela || map.dt_agendamento; // Fallback se janela não existir

    const dateFilter = `AND try_cast(${map.dt_peso_saida} as timestamp) >= date_add('day', -${days}, date_add('hour', -4, now()))`;

    const systemicQuery = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
          SELECT 
            ${map.id} as id,
            ${map.cliente} as cliente,
            try_cast(${map.dt_emissao} as timestamp) as dt_em,
            try_cast(${map.dt_agendamento} as timestamp) as dt_ag,
            try_cast(${dt_janela} as timestamp) as dt_janela,
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
          date_diff('hour', dt_em, dt_janela) as gap_emissao_h,
          date_diff('hour', dt_ag, dt_janela) as gap_agendamento_h
        FROM raw_data
        WHERE dt_ps IS NOT NULL AND dt_em IS NOT NULL
      ),
      stats AS (
        SELECT 
          approx_percentile(ciclo_total_h, 0.90) as p90,
          approx_percentile(ciclo_total_h, 0.25) as p25
        FROM metrics
      ),
      what_if AS (
        SELECT 
          'WHAT_IF' as tag,
          '' as label,
          avg(m.ciclo_total_h) as val1,
          avg(CASE WHEN m.ciclo_total_h <= s.p90 THEN m.ciclo_total_h ELSE NULL END) as val2,
          avg(CASE WHEN m.ciclo_total_h > s.p25 THEN s.p25 ELSE m.ciclo_total_h END) as val3,
          0 as val4
        FROM metrics m CROSS JOIN stats s
      ),
      hist_emissao AS (
        SELECT 
          'HIST_EMISSAO' as tag,
          CASE 
            WHEN gap_emissao_h <= 24 THEN '0-24h'
            WHEN gap_emissao_h <= 48 THEN '24-48h'
            WHEN gap_emissao_h <= 72 THEN '48-72h'
            ELSE '>72h'
          END as label,
          count(*) as val1,
          0 as val2, 0 as val3, 0 as val4
        FROM metrics GROUP BY 2
      ),
      hist_agendamento AS (
        SELECT 
          'HIST_AGENDAMENTO' as tag,
          CASE 
            WHEN gap_agendamento_h <= 24 THEN '0-24h'
            WHEN gap_agendamento_h <= 48 THEN '24-48h'
            WHEN gap_agendamento_h <= 72 THEN '48-72h'
            ELSE '>72h'
          END as label,
          count(*) as val1,
          0 as val2, 0 as val3, 0 as val4
        FROM metrics GROUP BY 2
      ),
      rule_breakers AS (
        SELECT 
          'RULE_BREAKER' as tag,
          cliente as label,
          count(*) as val1,
          sum(CASE WHEN gap_emissao_h > 72 THEN 1 ELSE 0 END) as val2,
          avg(CASE WHEN gap_emissao_h > 72 THEN gap_emissao_h - 72 ELSE 0 END) as val3,
          (sum(CASE WHEN gap_emissao_h > 72 THEN 1.0 ELSE 0.0 END) / count(*)) * 100 as val4
        FROM metrics 
        GROUP BY cliente
        HAVING count(*) > 5
      )
      
      SELECT * FROM what_if
      UNION ALL SELECT * FROM hist_emissao
      UNION ALL SELECT * FROM hist_agendamento
      UNION ALL SELECT * FROM rule_breakers ORDER BY val4 DESC LIMIT 50
    `;

    const results = await runQuery(systemicQuery);
    
    const rows = results?.Rows?.slice(1).map((r: any) => {
      const d = r.Data || [];
      return {
        tag: d[0]?.VarCharValue,
        label: d[1]?.VarCharValue,
        val1: parseFloat(d[2]?.VarCharValue || '0'),
        val2: parseFloat(d[3]?.VarCharValue || '0'),
        val3: parseFloat(d[4]?.VarCharValue || '0'),
        val4: parseFloat(d[5]?.VarCharValue || '0')
      };
    }) || [];

    const whatIfData = rows.find((r: any) => r.tag === 'WHAT_IF');
    const simulation = whatIfData ? {
        real_avg: whatIfData.val1.toFixed(1),
        scenario_a: whatIfData.val2.toFixed(1),
        scenario_b: whatIfData.val3.toFixed(1)
    } : { real_avg: 0, scenario_a: 0, scenario_b: 0 };

    const formatHistogram = (tag: string) => {
        const items = rows.filter((r: any) => r.tag === tag);
        const order = ['0-24h', '24-48h', '48-72h', '>72h'];
        return items.map((i: any) => ({ bucket: i.label, count: i.val1 })).sort((a: any, b: any) => order.indexOf(a.bucket) - order.indexOf(b.bucket));
    };

    const response = {
      terminal,
      days,
      simulation,
      histograms: {
          emissao_vs_janela: formatHistogram('HIST_EMISSAO'),
          agendamento_vs_janela: formatHistogram('HIST_AGENDAMENTO')
      },
      anomalies: rows.filter((r: any) => r.tag === 'RULE_BREAKER').map((r: any) => ({
          entity: r.label,
          total_trips: r.val1,
          violations: r.val2,
          avg_excess_hours: r.val3.toFixed(1),
          violation_pct: r.val4.toFixed(1)
      }))
    };

    setCached(cacheKey, response);
    return NextResponse.json(response);

  } catch (error) {
    console.error("Systemic API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch Systemic diagnostics' }, { status: 500 });
  }
}
