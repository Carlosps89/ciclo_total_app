import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE, getSchemaMap, getAthenaView } from '@/lib/athena';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';
import { AnticipationResponse } from '@/lib/types';
import { ResultSet } from '@aws-sdk/client-athena';
import { getClientAthenaFilter } from '@/lib/client-filter';


// Helper to get BRT components (Same as in ciclo-total)
function getBRTComponents(date: Date): { full: string; ymd: string; h: string; m: string; s: string; year: string; month: string; day: string } {
  const fmt = (options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...options }).format(date);
  const ymd: string = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
  const h: string = fmt({ hour: '2-digit', hour12: false });
  const m: string = fmt({ minute: '2-digit' });
  const s: string = fmt({ second: '2-digit' });
  return { full: `${ymd} ${h}:${m}:${s}`, ymd, h, m, s, year: ymd.substring(0, 4), month: ymd.substring(5, 7), day: ymd.substring(8, 10) };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const produto: string | null = searchParams.get('produto');
    const praca: string | null = searchParams.get('praca');
    const cliente: string | null = searchParams.get('cliente');
    const debug: string | null = searchParams.get('debug');

    // Build schema map for optimized view
    const TARGET_VIEW: string = getAthenaView();

    const now: Date = new Date();
    const brt = getBRTComponents(now); // D0
    const isCleanData = TARGET_VIEW === 'pac_clean_data';

    // CACHE LAYER (15 min)
    const CACHE_TTL: number = 15 * 60 * 1000;
    const CACHE_KEY: string = `pac_antecipacoes_v3_${terminal}_${produto || 'all'}_${praca || 'all'}_${cliente || 'all'}`;
    const cachedData = getCached<any>(CACHE_KEY);
    if (cachedData) {
        return NextResponse.json(cachedData);
    }

    const map = await getSchemaMap(TARGET_VIEW);

    // Time Boundaries
    const startDay: string = `${brt.ymd} 00:00:00`;
    // We want to capture everything that arrived "Today" (D0) onwards.
    // D+1 Window analysis needs arrivals from Today (D0) and Tomorrow (D1).
    // But usually D+1 trucks arrive Today.
    // So `cheguei >= startDay` is the correct "Arrivals Since Start of Today" universe.
    // We can cap it at `now` or just leaving it open (Athena partition limit handles it).
    // Let's cap at D+1 End to be safe and consistent with "D vs D+1".
    const tmr: Date = new Date(now);
    tmr.setDate(tmr.getDate() + 1);
    const d2: Date = new Date(now);
    d2.setDate(d2.getDate() + 2);

    const brtTmr = getBRTComponents(tmr); // D1
    const brtD2 = getBRTComponents(d2);   // D2
    const endNextDay: string = `${brtTmr.ymd} 23:59:59`;
    const endD2: string = `${brtD2.ymd} 23:59:59`;
    
    const produtoFilterRaw = produto ? `AND ${map.produto} = '${produto}'` : '';
    const clienteFilterRaw = getClientAthenaFilter(terminal, cliente, `base.${map.cliente}`);
    
    const pracaFilterRaw = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    if (pracaFilterRaw.isNoMatch) {
        const response: AnticipationResponse & { debug_praca_warning?: any } = {
          terminal,
          updated_at: new Date().toISOString(),
          antecipando_agora: { count: 0, pct: 0, avg_h: 0 },
          base_agora: { count_total: 0 },
          top_origens: [],
          histogram: [],
          window_bars: { now_sp_iso: brt.full, d0: [], d1: [], d2: [], d0_total: 0, d1_total: 0, d2_total: 0 },
          debug_praca_warning: pracaFilterRaw.warning
        };
        return NextResponse.json(response);
    }

    // Manual CTE construction to use VW_Ciclo (stripping problematic columns)
    const raw_cols: string = `
        ${map.id} as _col_id,
        ${map.terminal} as _col_terminal,
        ${map.placa} as _col_placa,
        ${map.origem} as _col_origem,
        '1900-01-01' as _col_emissao, -- Stub
        ${map.dt_agendamento} as _col_agendamento,
        ${map.dt_chegada} as _col_chegada,
        ${map.dt_peso_saida} as _col_peso_saida,
        '1900-01-01' as _col_chamada, -- Stub
        ${map.dt_cheguei} as _col_cheguei,
        ${map.janela_agendamento} as _col_janela,
        greatest(
            coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
            coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00')
        ) as ts_ult
    `;

    const query: string = `
      ${pracaFilterRaw.cte}
      ${pracaFilterRaw.cte ? ',' : 'WITH'} raw_data AS (
          SELECT ${raw_cols}
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
          ${pracaFilterRaw.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${isCleanData ? `AND dt IN ('ACTIVE', 
                format_datetime(date_add('day', -1, now()), 'yyyy-MM-dd'),
                format_datetime(date_add('day', -2, now()), 'yyyy-MM-dd'),
                format_datetime(date_add('day', -3, now()), 'yyyy-MM-dd'),
                format_datetime(date_add('day', -4, now()), 'yyyy-MM-dd'),
                format_datetime(date_add('day', -5, now()), 'yyyy-MM-dd'),
                format_datetime(date_add('day', -6, now()), 'yyyy-MM-dd'),
                format_datetime(now(), 'yyyy-MM-dd')
            )` : ''}
            ${produtoFilterRaw.replace(map.produto, `base.${map.produto}`)}
            ${clienteFilterRaw}
      ),
      dedupped AS (
          SELECT * FROM (
              SELECT *, ${isCleanData ? '1 as rn' : `row_number() OVER (PARTITION BY _col_id ORDER BY ts_ult DESC) as rn`}
              FROM raw_data
          ) WHERE rn = 1
      ),
      calc AS (
          SELECT
              _col_id as gmo_id,
              _col_placa as placa_tracao,
              _col_origem as origem,
              _col_terminal as terminal,
              try_cast(_col_peso_saida as timestamp) as peso_saida,
              try_cast(_col_cheguei as timestamp) as cheguei,
              try_cast(_col_janela as timestamp) as janela_agendamento,
              try_cast(_col_agendamento as timestamp) as dt_agendamento
          FROM dedupped
      )
      , universe AS (
          SELECT 
            *,
            CASE WHEN cheguei < janela_agendamento THEN 1 ELSE 0 END as is_early,
            date_diff('second', cheguei, janela_agendamento) / 3600.0 as hours_early,
            -- Rolling Hour Offset from "Current Hour Start" for the Distribution Chart
            date_diff('hour', timestamp '${brt.ymd} ${brt.h}:00:00', janela_agendamento) as h_rel,
            -- D vs D+1 Flag (Legacy support)
            CASE 
                WHEN date(janela_agendamento) = date(timestamp '${startDay}') THEN 'D0'
                WHEN date(janela_agendamento) = date(timestamp '${startDay}') + interval '1' day THEN 'D1'
                WHEN date(janela_agendamento) = date(timestamp '${startDay}') + interval '2' day THEN 'D2'
                ELSE 'OTHER'
            END as window_day
          FROM calc
          WHERE cheguei IS NOT NULL -- Must have arrived (Status 'Cheguei')
            AND janela_agendamento >= timestamp '${startDay}' -- Window is Today
            AND janela_agendamento <= timestamp '${endD2}' -- UP TO D+2 (72H)
      )
      -- Aggregations
      , agg_global AS (
        SELECT 
           count(distinct gmo_id) as total_arrivals_unique,
           count(CASE WHEN window_day = 'D0' THEN 1 END) as total_d,
           count(CASE WHEN window_day = 'D1' THEN 1 END) as total_d1,
           count(CASE WHEN window_day = 'D2' THEN 1 END) as total_d2,
           count(CASE WHEN is_early = 1 THEN 1 END) as total_early,
           count(CASE WHEN peso_saida IS NOT NULL THEN 1 END) as total_finished_subset,
           avg(CASE WHEN is_early = 1 THEN hours_early END) as avg_early_h,
           max(CASE WHEN is_early = 1 THEN hours_early END) as max_early_h
        FROM universe
      )
      , agg_origins AS (
        SELECT origem, count(distinct gmo_id) as cnt 
        FROM universe 
        WHERE is_early = 1
        GROUP BY 1 
        ORDER BY 2 DESC 
        LIMIT 6
      )
      , agg_hist_raw AS (
        SELECT 
           cast(floor(hours_early) as int) as h_bin, 
           count(distinct gmo_id) as cnt
        FROM universe
        WHERE is_early = 1
        GROUP BY 1
      )
      , agg_windows_rolling AS (
         SELECT 
            h_rel,
            count(distinct gmo_id) as cnt_win,
            min(janela_agendamento) as sample_ts
         FROM universe
         WHERE h_rel >= 0 AND h_rel < 48
         GROUP BY 1
      )
      , agg_windows_legacy AS (
         SELECT 
            window_day,
            hour(janela_agendamento) as h_window,
            count(distinct gmo_id) as cnt_win
         FROM universe
         WHERE window_day IN ('D0', 'D1')
         GROUP BY 1, 2
      )

      SELECT 'GLOBAL' as type, 
             cast(total_arrivals_unique as varchar) as v1, 
             cast(total_d as varchar) as v2, 
             cast(total_d1 as varchar) as v3, 
             cast(total_early as varchar) as v4, 
             cast(avg_early_h as varchar) as v5, 
             cast(max_early_h as varchar) as v6,
             cast(total_finished_subset as varchar) as v7,
             cast(total_d2 as varchar) as v8
      FROM agg_global
      UNION ALL
      SELECT 'ORIGIN' as type, origem as v1, cast(cnt as varchar) as v2, '' as v3, '' as v4, '' as v5, '' as v6, '' as v7, '' as v8 FROM agg_origins
      UNION ALL
      SELECT 'HIST_RAW' as type, cast(h_bin as varchar) as v1, cast(cnt as varchar) as v2, '' as v3, '' as v4, '' as v5, '' as v6, '' as v7, '' as v8 FROM agg_hist_raw
      UNION ALL
      SELECT 'WINDOW_LEGACY' as type, window_day as v1, cast(h_window as varchar) as v2, cast(cnt_win as varchar) as v3, '' as v4, '' as v5, '' as v6, '' as v7, '' as v8 FROM agg_windows_legacy
      UNION ALL
      SELECT 'WINDOW_ROLLING' as type, cast(h_rel as varchar) as v1, cast(cnt_win as varchar) as v2, cast(sample_ts as varchar) as v3, '' as v4, '' as v5, '' as v6, '' as v7, '' as v8 FROM agg_windows_rolling
    `;

    const results: ResultSet | undefined = await runQuery(query);
    const rows: AthenaRow[] = (results?.Rows?.slice(1) || []) as AthenaRow[];


    let total_arrivals_unique: number = 0, total_d: number = 0, total_d1: number = 0, total_d2: number = 0, total_early: number = 0, total_finished: number = 0, avg_early_h: number = 0;
    const top_origens: { origem: string; count: number }[] = [];
    const hist_raw: Record<number, number> = {};
    const win_legacy: Record<string, number> = {}; 
    const win_rolling: Record<number, { count: number; ts: string }> = {};


    interface AthenaRow {
        Data?: { VarCharValue?: string }[];
    }

    // 216: const max_early_h_val = parseFloat(data[6] || '0');
    let max_early_h_actual = 24;

    rows.forEach((r: AthenaRow) => {
      const data: string[] = r.Data?.map((d: { VarCharValue?: string }) => d.VarCharValue || '') || [];
      const type: string = data[0];

      if (type === 'GLOBAL') {
        total_arrivals_unique = parseInt(data[1] || '0');
        total_d = parseInt(data[2] || '0');
        total_d1 = parseInt(data[3] || '0');
        total_early = parseInt(data[4] || '0');
        avg_early_h = parseFloat(data[5] || '0');
        max_early_h_actual = Math.max(24, Math.ceil(parseFloat(data[6] || '0')));
        total_finished = parseInt(data[7] || '0');
        total_d2 = parseInt(data[8] || '0');
      } else if (type === 'ORIGIN') {
        top_origens.push({ origem: data[1], count: parseInt(data[2]) });
      } else if (type === 'HIST_RAW') {
        const bin: number = parseInt(data[1]);
        if (!isNaN(bin)) hist_raw[bin] = parseInt(data[2]);
      } else if (type === 'WINDOW_LEGACY') {
        const day: string = data[1]; 
        const hour: number = parseInt(data[2]);
        win_legacy[`${day}-${hour}`] = parseInt(data[3]);
      } else if (type === 'WINDOW_ROLLING') {
        const h_rel: number = parseInt(data[1]);
        const count: number = parseInt(data[2]);
        const ts: string = data[3];
        win_rolling[h_rel] = { count, ts };
      }
    });

    // Dynamic Histogram - Range based on max_early_h_actual
    const dynamicHistogram: { bucket: string; count: number; pct: number }[] = [];
    const step = max_early_h_actual > 48 ? 6 : (max_early_h_actual > 24 ? 3 : 2);
    
    for (let i = 0; i < max_early_h_actual; i += step) {
      let count = 0;
      for (let j = 0; j < step; j++) {
        count += (hist_raw[i + j] || 0);
      }
      dynamicHistogram.push({
        bucket: `${i}-${i + step}`,
        count: count,
        pct: total_early > 0 ? (count / total_early * 100) : 0
      });
    }

    // Overflow Bucket (Only if there's something beyond max_early_h_actual, which shouldn't happen with our ceil logic)
    let overflowCount = 0;
    Object.keys(hist_raw).forEach(key => {
      const bin = parseInt(key);
      if (bin >= max_early_h_actual) {
        overflowCount += hist_raw[bin];
      }
    });

    if (overflowCount > 0) {
      dynamicHistogram.push({
        bucket: `${max_early_h_actual}+`,
        count: overflowCount,
        pct: total_early > 0 ? (overflowCount / total_early * 100) : 0
      });
    }

    // 72h Rolling Window (D+2 Support)
    const rolling: { hour_rel: number; label: string; count: number; ts: string; day_offset: number }[] = [];
    const currentHour = parseInt(brt.h);
    
    for (let i = 0; i < 72; i++) {
        const absoluteHour = currentHour + i;
        const day_offset = Math.floor(absoluteHour / 24);
        const h_label = absoluteHour % 24;
        const entry = win_rolling[i] || { count: 0, ts: '' };
        rolling.push({
            hour_rel: i,
            label: `${h_label}h`,
            count: entry.count,
            ts: entry.ts,
            day_offset
        });
    }

    // Legacy buckets (still return for backwards compatibility if needed)
    const d0: { hour: number; count: number }[] = [], d1: { hour: number; count: number }[] = [], d2_bars: { hour: number; count: number }[] = [];
    for (let h: number = 0; h < 24; h++) {
      d0.push({ hour: h, count: win_legacy[`D0-${h}`] || 0 });
      d1.push({ hour: h, count: win_legacy[`D1-${h}`] || 0 });
      d2_bars.push({ hour: h, count: win_legacy[`D2-${h}`] || 0 });
    }

    console.log(`[ANTECIPACOES-UNIVERSE] Total=${total_arrivals_unique} D0=${total_d} D1=${total_d1} Early=${total_early} FinishedSubset=${total_finished}`);

    const response: AnticipationResponse & { rolling_windows?: any[] } = {
      terminal,
      updated_at: new Date().toISOString(),
      antecipando_agora: {
        count: total_early,
        pct: total_arrivals_unique > 0 ? (total_early / total_arrivals_unique * 100) : 0,
        avg_h: avg_early_h
      },
      base_agora: { count_total: total_arrivals_unique },
      top_origens,
      histogram: dynamicHistogram,
      window_bars: {
        now_sp_iso: brt.full,
        d0,
        d1,
        d2: d2_bars,
        d0_total: total_d,
        d1_total: total_d1,
        d2_total: total_d2
      },
      rolling_windows: rolling
    };

    // Set Cache (15 min)
    setCached(CACHE_KEY, response, 30 * 60 * 1000);

    return NextResponse.json(response);

  } catch (error) {
    console.error("Anticipation API Error (Universe V1):", error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
