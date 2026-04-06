import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE, getAthenaView, getSchemaMap } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
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
    const bucket: string = searchParams.get('bucket') || '';
    const produto: string | null = searchParams.get('produto');
    const cliente: string | null = searchParams.get('cliente');
    
    // Default limit
    const limit = 50;

    const cacheKey = `pac_antecip_bucket_v3_${terminal}_${bucket}_${produto || 'all'}_${cliente || 'all'}`;
    const cachedData = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    if (!bucket) {
        return NextResponse.json({ error: 'Bucket Required' }, { status: 400 });
    }

    const TARGET_VIEW: string = getAthenaView();
    const isCleanData = TARGET_VIEW === 'pac_clean_data';
    const map: Record<string, string> = await getSchemaMap(TARGET_VIEW);
      
    const produtoFilterRaw = produto ? `AND ${map.produto} = '${produto}'` : '';
    const clienteFilterRaw = getClientAthenaFilter(terminal, cliente, map.cliente);

    const now: Date = new Date();
    const brt = getBRTComponents(now); // D0

    // Time Boundaries
    const startDay: string = `${brt.ymd} 00:00:00`;
    const tmr: Date = new Date(now);
    tmr.setDate(tmr.getDate() + 1);
    const brtTmr = getBRTComponents(tmr); // D1
    const endNextDay: string = `${brtTmr.ymd} 23:59:59`;

    // Manual CTE construction
    const raw_cols: string = `
        ${map.id} as _col_id,
        ${map.terminal} as _col_terminal,
        ${map.placa} as _col_placa,
        ${map.origem} as _col_origem,
        ${map.produto} as _col_produto,
        coalesce(${map.dt_emissao}, ${map.dt_agendamento}) as _col_emissao,
        coalesce(${map.dt_chamada}, ${map.dt_cheguei}) as _col_chamada,
        ${map.dt_agendamento} as _col_agendamento,
        ${map.dt_chegada} as _col_chegada,
        ${map.dt_peso_saida} as _col_peso_saida,
        ${map.dt_cheguei} as _col_cheguei,
        ${map.janela_agendamento} as _col_janela,
        greatest(
            coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
            coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00')
        ) as ts_ult
    `;

    // Parsing Bucket Logic
    let bucketFilter = '';
    
    if (bucket === '12h+') {
        bucketFilter = `hours_early >= 12`;
    } else {
        // Expected format "0-1", "1-2"
        const parts = bucket.split('-');
        if (parts.length === 2) {
            const start = parseInt(parts[0]);
            // const end = parseInt(parts[1]); 
            // Logic: start <= h < start + 1 (since end is just start + 1)
             bucketFilter = `hours_early >= ${start} AND hours_early < ${start + 1}`;
        }
    }

    if (!bucketFilter) {
         return NextResponse.json({ error: 'Invalid Bucket Format' }, { status: 400 });
    }

    const query: string = `
      WITH raw_data AS (
          SELECT ${raw_cols}
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}"
          WHERE ${map.terminal} = '${terminal}'
            ${produtoFilterRaw}
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
              _col_produto as produto,
              _col_chamada as dt_chamada,
              try_cast(_col_peso_saida as timestamp) as peso_saida,
              try_cast(_col_cheguei as timestamp) as cheguei,
              try_cast(_col_chegada as timestamp) as chegada,
              try_cast(_col_janela as timestamp) as janela_agendamento,
              try_cast(_col_agendamento as timestamp) as dt_agendamento,
              try_cast(_col_emissao as timestamp) as dt_emissao
          FROM dedupped
      )
      , arrivals_today AS (
          SELECT 
            *,
            CASE WHEN cheguei < janela_agendamento THEN 1 END as is_early,
            date_diff('second', cheguei, janela_agendamento) / 3600.0 as hours_early,
            date_diff('second', dt_emissao, coalesce(peso_saida, timestamp '${brt.full}')) / 3600.0 as ciclo_h,
            date_diff('second', dt_emissao, dt_agendamento) / 3600.0 as h_agendamento,
            date_diff('second', dt_agendamento, cheguei) / 3600.0 as h_viagem,
            date_diff('second', chegada, coalesce(peso_saida, timestamp '${brt.full}')) / 3600.0 as h_interno
          FROM calc
          WHERE cheguei >= timestamp '${startDay}' 
            AND cheguei <= timestamp '${endNextDay}'
            AND janela_agendamento IS NOT NULL
      )
      SELECT 
        gmo_id,
        placa_tracao,
        origem,
        terminal,
        format_datetime(cheguei, 'dd/MM HH:mm') as cheguei_fmt,
        cast(hours_early as decimal(10,1)) as antecipacao_h,
        cast(ciclo_h as decimal(10,1)) as ciclo_h,
        produto,
        cast(dt_emissao as varchar) as dt_emissao,
        cast(dt_agendamento as varchar) as dt_agendamento,
        cast(janela_agendamento as varchar) as dt_janela,
        cast(cheguei as varchar) as dt_cheguei,
        cast(dt_chamada as varchar) as dt_chamada,
        cast(chegada as varchar) as dt_chegada,
        cast(peso_saida as varchar) as dt_peso_saida,
        cast(h_agendamento as decimal(10,1)) as h_agendamento,
        cast(h_viagem as decimal(10,1)) as h_viagem,
        cast(h_interno as decimal(10,1)) as h_interno
      FROM arrivals_today
      WHERE is_early = 1 
        AND ${bucketFilter}
      ORDER BY hours_early DESC
      LIMIT ${limit}
    `;

    const results: ResultSet | undefined = await runQuery(query);
    const rows: AthenaRow[] = (results?.Rows?.slice(1) || []) as AthenaRow[];

    interface AthenaRow {
        Data?: { VarCharValue?: string }[];
    }

    function safeParseFloat(val: string | undefined): number | undefined {
        if (!val) return undefined;
        const n = parseFloat(val);
        return isNaN(n) ? undefined : n;
    }

    const items = rows.map((r: AthenaRow) => {
      const data: string[] = r.Data?.map((d: { VarCharValue?: string }) => d.VarCharValue || '') || [];
      return {
        gmo_id: data[0],
        placa: data[1],
        origem: data[2],
        terminal: data[3],
        cheguei: data[4],
        antecipacao_h: parseFloat(data[5] || '0'), 
        ciclo_h: data[6] ? parseFloat(data[6]) : null,
        produto: data[7],
        dt_emissao: data[8],
        dt_agendamento: data[9],
        dt_janela: data[10],
        dt_cheguei: data[11],
        dt_chamada: data[12],
        dt_chegada: data[13],
        dt_peso_saida: data[14],
        h_agendamento: safeParseFloat(data[15]),
        h_viagem: safeParseFloat(data[16]),
        h_interno: safeParseFloat(data[17])
      };
    });

    let avg_ciclo_h = 0;
    let validCycleCount = 0;
    items.forEach(item => {
      // Calculate true cycle manually on JS side for safety if SQL is missing
      const trueCycle = (item.h_agendamento || 0) + (item.h_viagem || 0) + (item.h_interno || 0);
      
      if (trueCycle > 0) {
         avg_ciclo_h += trueCycle;
         validCycleCount++;
         // Override the returned ciclo_h for the frontend display
         item.ciclo_h = trueCycle;
      } else if (item.ciclo_h !== null && !isNaN(item.ciclo_h)) {
         avg_ciclo_h += item.ciclo_h;
         validCycleCount++;
      }
    });

    if (validCycleCount > 0) {
      avg_ciclo_h = avg_ciclo_h / validCycleCount;
    }

    const response = {
      terminal,
      bucket,
      count_loaded: items.length,
      limit,
      avg_ciclo_h,
      items
    };

    setCached(cacheKey, response);
    return NextResponse.json(response);

  } catch (error) {
    console.error("Anticipation Details API Error:", error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
