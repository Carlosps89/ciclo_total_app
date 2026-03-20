import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const terminal = searchParams.get('terminal');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const praca = searchParams.get('praca') || 'TODAS';
    const produto = searchParams.get('produto');

    // Drill-down specifics
    const stage = searchParams.get('stage'); // 'emissao_agendamento', 'agendamento_janela', 'viagem', 'verde', 'interno'
    const minHours = parseFloat(searchParams.get('minHours') || '0');
    const maxHours = searchParams.get('maxHours') ? parseFloat(searchParams.get('maxHours') as string) : null;
    const customStep = searchParams.get('step') ? parseInt(searchParams.get('step') as string, 10) : null;

    if (!terminal || !startDate || !endDate || !stage) {
      return NextResponse.json({ error: 'Faltam parâmetros obrigatórios (terminal, startDate, endDate, stage)' }, { status: 400 });
    }

    const cacheKey = `pac_diag_outliers_drilldown_v2_${terminal}_${startDate}_${endDate}_${stage}_${minHours}_${maxHours || 'inf'}_${praca}_${produto || 'all'}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    const TARGET_VIEW: string = 'VW_Ciclo';

    const rawCols = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: any) => res?.ResultSetMetadata?.ColumnInfo?.map((c: any) => c.Name).filter((n: any): n is string => !!n) || []);

    const map = getCleanMap(rawCols);
    const mapTrx = getCleanMap(rawCols);
    const mapTro = getCleanMap(rawCols);

    const pracaObj = applyPracaFilter(terminal as any, praca, `base.${map.origem}`, true);
    const produtoFilter = produto ? `AND base.${map.produto} = '${produto}'` : '';
    const dt_janela = terminal === 'TRM' ? mapTro.dt_janela : map.dt_janela;

    const stageColumnMap: Record<string, string> = {
      'emissao_agendamento': 'gap_emissao_agendamento_h',
      'agendamento_janela': 'gap_agendamento_h',
      'viagem': 'tempo_viagem_h',
      'verde': 'tempo_verde_h',
      'interno': 'tempo_interno_h'
    };

    const targetColumn = stageColumnMap[stage];
    if (!targetColumn) {
      return NextResponse.json({ error: 'Estágio inválido' }, { status: 400 });
    }

    const dateFilter = `AND try_cast(base.${map.dt_peso_saida} as timestamp) >= date('${startDate}') AND try_cast(base.${map.dt_peso_saida} as timestamp) < date('${endDate}') + interval '1' day`;

    const bucketFilter = maxHours !== null
      ? `${targetColumn} >= ${minHours} AND ${targetColumn} < ${maxHours}`
      : `${targetColumn} >= ${minHours}`;

    const dynamicMax = maxHours || minHours + 24; // If max is infinity (Mais de Xh), cap range visualizer to 24h delta
    const range = dynamicMax - minHours;
    let step = 1;

    if (customStep && customStep > 0) {
      step = customStep;
    } else {
      if (range <= 12) step = 1;
      else if (range <= 36) step = 2;
      else if (range <= 72) step = 4;
      else if (range <= 168) step = 12; // up to 7 days
      else step = 24;
    }

    if (pracaObj.isNoMatch) {
      return NextResponse.json({ meta: { count: 0 }, vehicles: [], histogram: [] });
    }

    const queryId = `drilldown_${terminal}_${stage}_${Date.now()}`;
    console.log(`[Athena] Query Iniciada (Drill-down): ${queryId}`);

    const sql = `
        ${pracaObj.cte}
        ${pracaObj.cte ? ',' : 'WITH'} raw_data AS (
            SELECT 
              base.gmo_id as id,
              coalesce(base.cliente, 'N/A') as cliente,
              coalesce(base.origem, 'N/A') as origem,
              try_cast(base.${map.dt_emissao} as timestamp) as dt_em,
              try_cast(base.${map.dt_agendamento} as timestamp) as dt_ag,
              try_cast(base.${map.dt_cheguei} as timestamp) as dt_cg,
              try_cast(base.${map.dt_chamada} as timestamp) as dt_cda,
              try_cast(base.${dt_janela} as timestamp) as dt_janela,
              try_cast(base.${map.dt_peso_saida} as timestamp) as dt_ps,
              -- Safe checks for viagem
              try_cast(${terminal === 'TRX' ? 'base.' + mapTrx.dt_cheguei : 'base.' + mapTro.dt_cheguei} as timestamp) as dt_ch_aux
            FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
            ${pracaObj.join}
            WHERE base.${map.terminal} = '${terminal}'
              ${produtoFilter}
              ${dateFilter}
            AND try_cast(base.${map.dt_peso_saida} as timestamp) IS NOT NULL
        ),
        metrics AS (
          SELECT 
            id, 
            cliente, 
            origem,
            CASE WHEN dt_em IS NOT NULL AND dt_ag IS NOT NULL THEN date_diff('hour', dt_em, dt_ag) ELSE 0 END as gap_emissao_agendamento_h,
            CASE WHEN dt_ag IS NOT NULL AND dt_janela IS NOT NULL THEN date_diff('hour', dt_ag, dt_janela) ELSE 0 END as gap_agendamento_h,
            CASE WHEN dt_ag IS NOT NULL AND dt_ch_aux IS NOT NULL THEN date_diff('second', dt_ag, dt_ch_aux) / 3600.0 ELSE 0 END as tempo_viagem_h,
            CASE WHEN dt_cg IS NOT NULL AND dt_cda IS NOT NULL THEN date_diff('second', dt_cg, dt_cda) / 3600.0 ELSE 0 END as tempo_verde_h,
            CASE WHEN dt_ch_aux IS NOT NULL AND dt_ps IS NOT NULL THEN date_diff('second', dt_ch_aux, dt_ps) / 3600.0 ELSE 0 END as tempo_interno_h,
            max(CASE 
               WHEN '${stage}' = 'emissao_agendamento' THEN dt_em
               WHEN '${stage}' = 'agendamento_janela' THEN dt_ag
               WHEN '${stage}' = 'viagem' THEN dt_ag
               WHEN '${stage}' = 'verde' THEN dt_cg
               WHEN '${stage}' = 'interno' THEN dt_ch_aux
               ELSE dt_em
            END) as dt_inicio
          FROM raw_data
          WHERE dt_em IS NOT NULL AND dt_ps IS NOT NULL
          GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
        ),
        filtered_metrics AS (
          SELECT 
            id as gmo,
            cliente,
            origem,
            dt_inicio,
            round(${targetColumn}, 1) as horas_na_etapa
          FROM metrics
          WHERE ${bucketFilter}
            AND ${targetColumn} > 0
        ),
        ranked_vehicles AS (
          SELECT 
             'VEHICLE' as tag,
             cast(gmo as varchar) as val1,
             cast(cliente as varchar) as val2,
             cast(origem as varchar) as val3,
             cast(horas_na_etapa as varchar) as val4 
          FROM filtered_metrics 
          ORDER BY horas_na_etapa DESC
          LIMIT 300
        ),
        micro_hist AS (
          SELECT
             'HISTOGRAM' as tag,
             cast(floor(horas_na_etapa / ${step}) * ${step} as varchar) as val1,
             cast(count(distinct gmo) as varchar) as val2,
             '' as val3,
             '' as val4
          FROM filtered_metrics
          GROUP BY 2
        ),
        heatmap AS (
          SELECT
             'HEATMAP' as tag,
             cast(day_of_week(dt_inicio) as varchar) as val1, -- 1=Monday, 7=Sunday in Presto/Athena
             cast(hour(dt_inicio) as varchar) as val2,
             cast(count(distinct gmo) as varchar) as val3,
             '' as val4
          FROM filtered_metrics
          WHERE dt_inicio IS NOT NULL
          GROUP BY 2, 3
        )
        SELECT * FROM ranked_vehicles
        UNION ALL
        SELECT * FROM micro_hist
        UNION ALL
        SELECT * FROM heatmap
        `;

    const results = await runQuery(sql);
    console.log(`[Athena] Query ${queryId} FINALIZADA.`);

    const rows = results?.Rows?.slice(1).map((r: any) => {
      const d = r.Data || [];
      return {
        tag: d[0]?.VarCharValue || '',
        val1: d[1]?.VarCharValue || '',
        val2: d[2]?.VarCharValue || '',
        val3: d[3]?.VarCharValue || '',
        val4: d[4]?.VarCharValue || '',
      };
    }) || [];

    const vehicles = rows.filter((r: any) => r.tag === 'VEHICLE').map((r: any) => ({
      gmo: r.val1 || 'N/A',
      cliente: r.val2 || 'Desconhecido',
      origem: r.val3 || 'N/A',
      horas: parseFloat(r.val4 || '0')
    }));

    // Ensure buckets are ordered
    const histData = rows.filter((r: any) => r.tag === 'HISTOGRAM').map((r: any) => ({
      bucket: parseFloat(r.val1 || '0'),
      label: `${r.val1}h - ${parseFloat(r.val1 || '0') + step}h`,
      volume: parseInt(r.val2 || '0', 10)
    })).sort((a: any, b: any) => a.bucket - b.bucket);

    const heatmapRows = rows.filter((r: any) => r.tag === 'HEATMAP');
    const heatmap = heatmapRows.map((r: any) => {
      // Presto day_of_week: 1=Mon .. 7=Sun.
      const dowMap: Record<string, string> = { '1': 'Segunda', '2': 'Terça', '3': 'Quarta', '4': 'Quinta', '5': 'Sexta', '6': 'Sábado', '7': 'Domingo' };
      return {
        day: dowMap[r.val1] || 'N/A',
        dayIdx: parseInt(r.val1),
        hour: parseInt(r.val2),
        volume: parseInt(r.val3)
      };
    }).filter((h: any) => h.day !== 'N/A');

    const response = {
      meta: {
        stage,
        minHours,
        maxHours,
        step,
        count: vehicles.length,
      },
      vehicles,
      histogram: histData,
      heatmap
    };

    setCached(cacheKey, response);
    return NextResponse.json(response);

  } catch (e: any) {
    console.error("Outliers Drilldown API Error:", e);
    return NextResponse.json({ error: e.message || "Internal Error" }, { status: 500 });
  }
}
