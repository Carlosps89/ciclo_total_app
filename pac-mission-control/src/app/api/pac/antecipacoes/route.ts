import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { applyPracaFilter } from '@/lib/pracas';
import { AnticipationResponse } from '@/lib/types';
import { ResultSet } from '@aws-sdk/client-athena';


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
    const debug: string | null = searchParams.get('debug');

    const TARGET_VIEW: string = 'VW_Ciclo';

    // Cast to any to avoid strict type checks on dynamic map properties
    const map: Record<string, string> = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [])
      .then((cols: string[]) => getCleanMap(cols));

    const now: Date = new Date();
    const brt = getBRTComponents(now); // D0

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
    const brtTmr = getBRTComponents(tmr); // D1
    const endNextDay: string = `${brtTmr.ymd} 23:59:59`;
    
    const produtoFilterRaw = produto ? `AND ${map.produto} = '${produto}'` : '';
    
    const pracaFilterRaw = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    if (pracaFilterRaw.isNoMatch) {
        const response: AnticipationResponse & { debug_praca_warning?: any } = {
          terminal,
          updated_at: new Date().toISOString(),
          antecipando_agora: { count: 0, pct: 0, avg_h: 0 },
          base_agora: { count_total: 0 },
          top_origens: [],
          histogram: [],
          window_bars: { now_sp_iso: brt.full, d0: [], d1: [], d0_total: 0, d1_total: 0 },
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
            ${produtoFilterRaw.replace(map.produto, `base.${map.produto}`)}
      ),
      dedupped AS (
          SELECT * FROM (
              SELECT *, row_number() OVER (PARTITION BY _col_id ORDER BY ts_ult DESC) as rn
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
      , arrivals_today AS (
          SELECT 
            *,
            CASE WHEN cheguei < janela_agendamento THEN 1 ELSE 0 END as is_early,
            date_diff('second', cheguei, janela_agendamento) / 3600.0 as hours_early,
            -- D vs D+1 Flag
            CASE 
                WHEN date(janela_agendamento) = date(timestamp '${startDay}') THEN 'D0'
                WHEN date(janela_agendamento) = date(timestamp '${startDay}') + interval '1' day THEN 'D1'
                ELSE 'OTHER'
            END as window_day
          FROM calc
          WHERE cheguei >= timestamp '${startDay}' 
            AND cheguei <= timestamp '${endNextDay}'
            AND janela_agendamento IS NOT NULL
      )
      -- Aggregations
      , agg_global AS (
        SELECT 
           count(distinct gmo_id) as total_arrivals_unique,
           count(CASE WHEN window_day = 'D0' THEN 1 END) as total_d,
           count(CASE WHEN window_day = 'D1' THEN 1 END) as total_d1,
           count(CASE WHEN is_early = 1 THEN 1 END) as total_early,
           count(CASE WHEN peso_saida IS NOT NULL THEN 1 END) as total_finished_subset,
           avg(CASE WHEN is_early = 1 THEN hours_early END) as avg_early_h,
           max(CASE WHEN is_early = 1 THEN hours_early END) as max_early_h
        FROM arrivals_today
      )
      , agg_origins AS (
        SELECT origem, count(distinct gmo_id) as cnt 
        FROM arrivals_today 
        WHERE is_early = 1
        GROUP BY 1 
        ORDER BY 2 DESC 
        LIMIT 6
      )
      , agg_hist_raw AS (
        SELECT 
           cast(floor(hours_early) as int) as h_bin, 
           count(distinct gmo_id) as cnt
        FROM arrivals_today
        WHERE is_early = 1
        GROUP BY 1
      )
      , agg_windows AS (
         SELECT 
            window_day,
            hour(janela_agendamento) as h_window,
            count(distinct gmo_id) as cnt_win
         FROM arrivals_today
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
             cast(total_finished_subset as varchar) as v7
      FROM agg_global
      UNION ALL
      SELECT 'ORIGIN' as type, origem as v1, cast(cnt as varchar) as v2, '' as v3, '' as v4, '' as v5, '' as v6, '' as v7 FROM agg_origins
      UNION ALL
      SELECT 'HIST_RAW' as type, cast(h_bin as varchar) as v1, cast(cnt as varchar) as v2, '' as v3, '' as v4, '' as v5, '' as v6, '' as v7 FROM agg_hist_raw
      UNION ALL
      SELECT 'WINDOW' as type, window_day as v1, cast(h_window as varchar) as v2, cast(cnt_win as varchar) as v3, '' as v4, '' as v5, '' as v6, '' as v7 FROM agg_windows
    `;

    const results: ResultSet | undefined = await runQuery(query);
    const rows: AthenaRow[] = (results?.Rows?.slice(1) || []) as AthenaRow[];


    let total_arrivals_unique: number = 0, total_d: number = 0, total_d1: number = 0, total_early: number = 0, total_finished: number = 0, avg_early_h: number = 0;
    const top_origens: { origem: string; count: number }[] = [];
    const hist_raw: Record<number, number> = {};
    const win_data: Record<string, number> = {}; // "D0-10", "D1-15"


    interface AthenaRow {
        Data?: { VarCharValue?: string }[];
    }

    rows.forEach((r: AthenaRow) => {
      const data: string[] = r.Data?.map((d: { VarCharValue?: string }) => d.VarCharValue || '') || [];
      const type: string = data[0];

      if (type === 'GLOBAL') {
        total_arrivals_unique = parseInt(data[1] || '0');
        total_d = parseInt(data[2] || '0');
        total_d1 = parseInt(data[3] || '0');
        total_early = parseInt(data[4] || '0');
        avg_early_h = parseFloat(data[5] || '0');
        // max_early_h = parseFloat(data[6] || '0');
        total_finished = parseInt(data[7] || '0'); // Subset of filtering
      } else if (type === 'ORIGIN') {
        // ... existing logic ...
        top_origens.push({ origem: data[1], count: parseInt(data[2]) });
      } else if (type === 'HIST_RAW') {
        const bin: number = parseInt(data[1]);
        if (!isNaN(bin)) hist_raw[bin] = parseInt(data[2]);
      } else if (type === 'WINDOW') {
        const day: string = data[1]; // D0 or D1
        const hour: number = parseInt(data[2]);
        win_data[`${day}-${hour}`] = parseInt(data[3]);
      }
    });

    // Histogram - Fixed Buckets (0-2 ... 22-24, 24+)
    const step = 2;
    const effectiveLimit = 24;
    const dynamicHistogram: { bucket: string; count: number; pct: number }[] = [];
    
    // 1. Buckets 0-24
    for (let i = 0; i < effectiveLimit; i += step) {
      const count = (hist_raw[i] || 0) + (hist_raw[i + 1] || 0);
      dynamicHistogram.push({
        bucket: `${i}-${i + step}`,
        count: count,
        pct: total_early > 0 ? (count / total_early * 100) : 0
      });
    }

    // 2. Overflow Bucket (24+)
    let overflowCount = 0;
    Object.keys(hist_raw).forEach(key => {
      const bin = parseInt(key);
      if (bin >= effectiveLimit) {
        overflowCount += hist_raw[bin];
      }
    });

    dynamicHistogram.push({
      bucket: '24h+',
      count: overflowCount,
      pct: total_early > 0 ? (overflowCount / total_early * 100) : 0
    });

    // const d0 = [], d1 = [];
    const d0: { hour: number; count: number }[] = [], d1: { hour: number; count: number }[] = [];
    // let d0_check = 0, d1_check = 0;
    for (let h: number = 0; h < 24; h++) {
      const c0: number = win_data[`D0-${h}`] || 0;
      const c1: number = win_data[`D1-${h}`] || 0;
      d0.push({ hour: h, count: c0 });
      d1.push({ hour: h, count: c1 });
      // d0_check += c0;
      // d1_check += c1;
    }

    console.log(`[ANTECIPACOES-UNIVERSE] Total=${total_arrivals_unique} D0=${total_d} D1=${total_d1} Early=${total_early} FinishedSubset=${total_finished}`);

    const response: AnticipationResponse = {
      terminal,
      updated_at: new Date().toISOString(),
      antecipando_agora: {
        count: total_early,
        pct: total_arrivals_unique > 0 ? (total_early / total_arrivals_unique * 100) : 0,
        avg_h: avg_early_h
      },
      base_agora: { count_total: total_arrivals_unique },
      //base_finished: { count_total: total_finished }, // Just for reference, although it's a subset
      top_origens,
      histogram: dynamicHistogram,
      window_bars: {
        now_sp_iso: brt.full,
        d0, // Array of objects
        d1, // Array of objects 
        d0_total: total_d,
        d1_total: total_d1
      }
    };

    // No caching during debug phase to ensure freshness
    return NextResponse.json(response);

  } catch (error) {
    console.error("Anticipation API Error (Universe V1):", error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
