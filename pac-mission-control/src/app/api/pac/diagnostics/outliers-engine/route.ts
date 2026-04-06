import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE, getAthenaView, getSchemaMap } from '@/lib/athena';
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
    // Advanced Date Filter (v3)
    const dtNow = new Date();
    const dtMinus7 = new Date();
    dtMinus7.setDate(dtNow.getDate() - 7);

    // Default config: Last 7 days if URL params are missing
    const defaultStart = dtMinus7.toISOString().split('T')[0];
    const defaultEnd = dtNow.toISOString().split('T')[0];

    const startDate: string = searchParams.get('startDate') || defaultStart;
    const endDate: string = searchParams.get('endDate') || defaultEnd;

    // Advanced Configuration Overrides (v4 Pro Customization)
    const iqrMultiplier = parseFloat(searchParams.get('iqrMultiplier') || '1.5');
    const overrideEmissao = parseFloat(searchParams.get('overrideEmissao') || '0');
    const overrideAgendamento = parseFloat(searchParams.get('overrideAgendamento') || '0');
    const overrideViagem = parseFloat(searchParams.get('overrideViagem') || '0');
    const overrideVerde = parseFloat(searchParams.get('overrideVerde') || '0');
    const overrideInterno = parseFloat(searchParams.get('overrideInterno') || '0');

    // Dynamic Histograms Steps (Iteration 7)
    const stepEmissao = parseFloat(searchParams.get('stepEmissao') || '24');
    const stepAgendamento = parseFloat(searchParams.get('stepAgendamento') || '24');
    const stepViagem = parseFloat(searchParams.get('stepViagem') || '24');
    const stepVerde = parseFloat(searchParams.get('stepVerde') || '24');
    const stepInterno = parseFloat(searchParams.get('stepInterno') || '12');

    // Filters
    const offenderFilter = searchParams.get('offenderFilter') || '';
    const cacheKey: string = `pac_diag_outliers_engine_v5_${terminal}_${produto || 'all'}_${praca || 'all'}_${startDate}_${endDate}_${iqrMultiplier}`;
    
    // Check Cache
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    const whitelistStr = searchParams.get('whitelist') || '';

    const TARGET_VIEW: string = getAthenaView();
    const map = await getSchemaMap(TARGET_VIEW);


    const whitelistCondition = whitelistStr
      ? `AND id NOT IN (${whitelistStr.split(',').map((id: string) => `'${id.trim()}'`).join(',')})`
      : '';

    const offenderCondition = offenderFilter
      ? `AND concat(coalesce(base.${map.cliente}, 'N/A'), ' - ', coalesce(base.${map.origem}, 'N/A')) = '${offenderFilter}'`
      : '';

    const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';

    const dt_janela = map.dt_janela || map.dt_agendamento;

    const dateFilter = `AND date(try_cast(${map.dt_peso_saida} as timestamp)) BETWEEN date('${startDate}') AND date('${endDate}')`;

    // Advanced IQR Analytics Query
    const query = `
      ${pracaFilter.cte}
      ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
          SELECT 
            ${map.id} as id,
            coalesce(base.${map.cliente}, 'N/A') as cliente,
            coalesce(base.${map.origem}, 'N/A') as origem,
            try_cast(${map.dt_emissao} as timestamp) as dt_em,
            try_cast(${map.dt_agendamento} as timestamp) as dt_ag,
            try_cast(${map.dt_chegada} as timestamp) as dt_ch,
            try_cast(${map.dt_cheguei} as timestamp) as dt_cg,
            try_cast(${map.dt_chamada} as timestamp) as dt_cda,
            try_cast(${dt_janela} as timestamp) as dt_janela,
            try_cast(${map.dt_peso_saida} as timestamp) as dt_ps
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
          ${pracaFilter.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${produtoFilter}
            ${dateFilter}
            ${offenderCondition}
          -- Guarantee validity
          AND try_cast(${map.dt_peso_saida} as timestamp) IS NOT NULL
      ),
      metrics AS (
        SELECT 
          id, cliente, origem,
          date_diff('second', dt_em, dt_ps) / 3600.0 as ciclo_total_h,
          CASE WHEN dt_em IS NOT NULL AND dt_ag IS NOT NULL THEN date_diff('hour', dt_em, dt_ag) ELSE 0 END as gap_emissao_agendamento_h,
          CASE WHEN dt_ag IS NOT NULL AND dt_janela IS NOT NULL THEN date_diff('hour', dt_ag, dt_janela) ELSE 0 END as gap_agendamento_h,
          CASE WHEN dt_ag IS NOT NULL AND dt_ch IS NOT NULL THEN date_diff('second', dt_ag, dt_ch) / 3600.0 ELSE 0 END as tempo_viagem_h,
          CASE WHEN dt_ch IS NOT NULL AND dt_ps IS NOT NULL THEN date_diff('second', dt_ch, dt_ps) / 3600.0 ELSE 0 END as tempo_interno_h,
          CASE WHEN dt_cg IS NOT NULL AND dt_cda IS NOT NULL THEN date_diff('second', dt_cg, dt_cda) / 3600.0 ELSE 0 END as tempo_verde_h
        FROM raw_data
        WHERE dt_em IS NOT NULL AND dt_ps IS NOT NULL
        ${whitelistCondition}
        -- Dedup raw data mathematically to avoid cartesian blowups (28k anomaly)
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
      ),
      -- Compute IQR for Anomaly Bounds
      stats AS (
        SELECT 
          count(distinct id) as total_vol,
          approx_percentile(ciclo_total_h, 0.25) as q1_ciclo,
          approx_percentile(ciclo_total_h, 0.75) as q3_ciclo,
          approx_percentile(tempo_viagem_h, 0.75) as q3_viagem,
          approx_percentile(tempo_interno_h, 0.75) as q3_interno,
          approx_percentile(tempo_verde_h, 0.75) as q3_verde,
          approx_percentile(gap_agendamento_h, 0.75) as q3_agend,
          approx_percentile(gap_emissao_agendamento_h, 0.75) as q3_emissao
        FROM metrics
      ),
      bounds AS (
        SELECT 
          total_vol,
          q1_ciclo,
          q3_ciclo + ${iqrMultiplier} * (q3_ciclo - q1_ciclo) as ciclo_max,
          ${overrideViagem > 0 ? overrideViagem : `CASE WHEN q3_viagem > 0 THEN q3_viagem + ${iqrMultiplier} * q3_viagem ELSE 24 END`} as viagem_max,
          ${overrideInterno > 0 ? overrideInterno : `CASE WHEN q3_interno > 0 THEN q3_interno + ${iqrMultiplier} * q3_interno ELSE 12 END`} as interno_max,
          ${overrideVerde > 0 ? overrideVerde : `CASE WHEN q3_verde > 0 THEN q3_verde + ${iqrMultiplier} * q3_verde ELSE 24 END`} as verde_max,
          ${overrideAgendamento > 0 ? overrideAgendamento : `72.0`} as gap_agend_max,
          ${overrideEmissao > 0 ? overrideEmissao : `CASE WHEN q3_emissao > 0 THEN q3_emissao + ${iqrMultiplier} * q3_emissao ELSE 48 END`} as emissao_max
        FROM stats
      ),
      what_if AS (
        SELECT 
          'WHAT_IF' as tag,
          '' as label,
          avg(m.ciclo_total_h) as val1, -- Real
          avg(CASE WHEN m.ciclo_total_h <= b.ciclo_max THEN m.ciclo_total_h ELSE NULL END) as val2, -- Filtered Outliers
          avg(CASE WHEN m.ciclo_total_h > b.ciclo_max THEN b.q1_ciclo ELSE m.ciclo_total_h END) as val3, -- Leveled to P25
          b.total_vol as val4,
          0 as val5,
          0 as val6
        FROM metrics m CROSS JOIN bounds b
        GROUP BY b.total_vol, b.ciclo_max, b.q1_ciclo
      ),
      -- Histogram generation for distributions
      hist_emissao AS (
        SELECT 'HIST_EMISSAO' as tag, cast(floor(LEAST(gap_emissao_agendamento_h, 144) / ${stepEmissao}) * ${stepEmissao} as varchar) as label, count(distinct id) as val1, max(gap_emissao_agendamento_h) as val2, 0 as val3, 0 as val4, 0 as val5, 0 as val6 FROM metrics GROUP BY 2
      ),
      hist_agend AS (
        SELECT 'HIST_AGEND' as tag, cast(floor(LEAST(gap_agendamento_h, 144) / ${stepAgendamento}) * ${stepAgendamento} as varchar) as label, count(distinct id) as val1, max(gap_agendamento_h) as val2, 0 as val3, 0 as val4, 0 as val5, 0 as val6 FROM metrics GROUP BY 2
      ),
      hist_viagem AS (
        SELECT 'HIST_VIAGEM' as tag, cast(floor(LEAST(tempo_viagem_h, 120) / ${stepViagem}) * ${stepViagem} as varchar) as label, count(distinct id) as val1, max(tempo_viagem_h) as val2, 0 as val3, 0 as val4, 0 as val5, 0 as val6 FROM metrics GROUP BY 2
      ),
      hist_interno AS (
        SELECT 'HIST_INTERNO' as tag, cast(floor(LEAST(tempo_interno_h, 96) / ${stepInterno}) * ${stepInterno} as varchar) as label, count(distinct id) as val1, max(tempo_interno_h) as val2, 0 as val3, 0 as val4, 0 as val5, 0 as val6 FROM metrics GROUP BY 2
      ),
      hist_verde AS (
        SELECT 'HIST_VERDE' as tag, cast(floor(LEAST(tempo_verde_h, 96) / ${stepVerde}) * ${stepVerde} as varchar) as label, count(distinct id) as val1, max(tempo_verde_h) as val2, 0 as val3, 0 as val4, 0 as val5, 0 as val6 FROM metrics GROUP BY 2
      ),
      -- Hidden patterns
      patterns AS (
        SELECT 
          'PATTERN' as tag,
          concat(cliente, ' - ', origem) as label,
          count(distinct id) as val1, -- Total Vol
          -- Calculate outlier volume inside each entity
          sum(CASE WHEN ciclo_total_h > b.ciclo_max THEN 1 ELSE 0 END) as val2, -- Outlier Vol
          -- Average time of the anomalies
          avg(CASE WHEN ciclo_total_h > b.ciclo_max THEN ciclo_total_h ELSE NULL END) as val3, 
          0 as val4,
          0 as val5,
          0 as val6
        FROM metrics m CROSS JOIN bounds b
        GROUP BY cliente, origem, b.ciclo_max
        HAVING sum(CASE WHEN ciclo_total_h > b.ciclo_max THEN 1 ELSE 0 END) > 5
      )

      SELECT * FROM what_if
      UNION ALL
      -- Extract thresholds to frontend config
      SELECT 'THRESHOLDS', '', ciclo_max, viagem_max, interno_max, gap_agend_max, verde_max, emissao_max FROM bounds
      UNION ALL SELECT * FROM hist_emissao
      UNION ALL SELECT * FROM hist_agend
      UNION ALL SELECT * FROM hist_viagem
      UNION ALL SELECT * FROM hist_interno
      UNION ALL SELECT * FROM hist_verde
      UNION ALL SELECT * FROM patterns ORDER BY val2 DESC LIMIT 100
    `;

    const results = await runQuery(query);

    // Parse the results from the generic tag format
    const rows = results?.Rows?.slice(1).map((r: any) => {
      const d = r.Data || [];
      return {
        tag: d[0]?.VarCharValue,
        label: d[1]?.VarCharValue,
        val1: parseFloat(d[2]?.VarCharValue || '0'),
        val2: parseFloat(d[3]?.VarCharValue || '0'),
        val3: parseFloat(d[4]?.VarCharValue || '0'),
        val4: parseFloat(d[5]?.VarCharValue || '0'),
        val5: parseFloat(d[6]?.VarCharValue || '0'),
        val6: parseFloat(d[7]?.VarCharValue || '0')
      };
    }) || [];

    const whatIfData = rows.find((r: any) => r.tag === 'WHAT_IF') || { val1: 0, val2: 0, val3: 0, val4: 0 };
    const simulation = {
      real_avg: whatIfData.val1.toFixed(1),
      avg_no_outliers: whatIfData.val2.toFixed(1),
      avg_leveled_p25: whatIfData.val3.toFixed(1),
      delta_cut: (whatIfData.val1 - whatIfData.val2).toFixed(1),
      delta_level: (whatIfData.val1 - whatIfData.val3).toFixed(1),
      total_vol: whatIfData.val4
    };

    const thresholdsRow = rows.find((r: any) => r.tag === 'THRESHOLDS') || { val1: 100, val2: 40, val3: 20, val4: 72, val5: 24, val6: 48 };
    const thresholds = {
      ciclo: thresholdsRow.val1,
      viagem: thresholdsRow.val2,
      interno: thresholdsRow.val3,
      agendamento: thresholdsRow.val4,
      verde: thresholdsRow.val5,
      emissao: thresholdsRow.val6
    };

    const processHist = (tag: string, step: number, maxLimit: number) => {
      const histData = rows.filter((r: any) => r.tag === tag);
      const buckets = [];

      const realCap = Math.floor(maxLimit / step) * step;

      for (let i = 0; i <= realCap; i += step) {
        const row = histData.find((r: any) => parseInt(r.label) === i);
        let labelTxt = `${i}h - ${i + step}h`;
        if (i >= realCap) {
          labelTxt = `Mais de ${realCap}h`;
        }

        buckets.push({
          label: labelTxt,
          volume: row ? row.val1 : 0,
          maxHours: row ? row.val2 : 0 // If volume is 0, maxHours 0 ensures it doesn't trigger isAnomaly
        });
      }
      return buckets;
    }

    const histograms = {
      emissao: processHist('HIST_EMISSAO', stepEmissao, 144),
      agendamento: processHist('HIST_AGEND', stepAgendamento, 144),
      viagem: processHist('HIST_VIAGEM', stepViagem, 120),
      interno: processHist('HIST_INTERNO', stepInterno, 96),
      verde: processHist('HIST_VERDE', stepVerde, 96),
    };

    const patterns = rows.filter((r: any) => r.tag === 'PATTERN').map((r: any) => {
      // Simple logic for root cause badge
      const badge = r.val3 > thresholds.emissao + thresholds.agendamento + thresholds.viagem ? 'Faturamento Antecipado' : 'Ofensor Físico Operacional';
      return {
        entityName: r.label,
        totalVol: r.val1,
        outlierVol: r.val2,
        outlierAvgTime: r.val3 ? (r.val3 - thresholds.ciclo).toFixed(1) : 0,
        rootCauseBadge: badge
      };
    });

    const response = {
      simulation,
      thresholds,
      histograms,
      patterns
    };

    setCached(cacheKey, response); // Uses NEW 15 min DEFAULT_TTL
    return NextResponse.json(response);

  } catch (error) {
    console.error("Outliers API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch Outliers diagnostics' }, { status: 500 });
  }
}
