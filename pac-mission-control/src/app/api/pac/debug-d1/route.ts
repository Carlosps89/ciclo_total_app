import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { ResultSet } from '@aws-sdk/client-athena';

export const dynamic = 'force-dynamic';

function getBRTComponents(date: Date): { full: string; ymd: string; h: string; m: string; s: string } {
    const fmt = (options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...options }).format(date);
    const ymd: string = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
    const h: string = fmt({ hour: '2-digit', hour12: false });
    const m: string = fmt({ minute: '2-digit' });
    const s: string = fmt({ second: '2-digit' });
    return { full: `${ymd} ${h}:${m}:${s}`, ymd, h, m, s };
}

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const { searchParams }: URL = new URL(request.url);
        const terminal: string = searchParams.get('terminal') || 'TRO';

        const now: Date = new Date();
        const brt = getBRTComponents(now);

        const cacheKey = `pac_debug_d1_v2_${terminal}_${brt.ymd}`;
        const cachedData = getCached(cacheKey);
        if (cachedData) return NextResponse.json(cachedData);

        const TARGET_VIEW: string = 'VW_Ciclo';

        // Cast to any to avoid strict type checks on dynamic map properties
        const map: Record<string, string> = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
            .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [])
            .then((cols: string[]) => getCleanMap(cols));

        const startDay: string = `${brt.ymd} 00:00:00`;
        const endDay: string = `${brt.ymd} 23:59:59`;

        const raw_cols: string = `
            ${map.id} as _col_id,
            ${map.terminal} as _col_terminal,
            ${map.placa} as _col_placa,
            ${map.origem} as _col_origem,
            ${map.dt_emissao} as _col_emissao,
            ${map.dt_agendamento} as _col_agendamento,
            ${map.dt_chegada} as _col_chegada,
            ${map.dt_peso_saida} as _col_peso_saida,
            ${map.dt_chamada} as _col_chamada,
            ${map.dt_cheguei} as _col_cheguei,
            ${map.janela_agendamento} as _col_janela,
            -- Removed potentially missing columns for VW_Ciclo debug
            'Unknown' as _col_evento,
            'Unknown' as _col_situacao,
            greatest(
                coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
                coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
                coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
            ) as ts_ult
        `;

        const query: string = `
            WITH raw_data AS (
                SELECT ${raw_cols}
                FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}"
                WHERE ${map.terminal} = '${terminal}'
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
                    try_cast(_col_agendamento as timestamp) as dt_agendamento,
                    try_cast(_col_emissao as timestamp) as dt_emissao,
                    try_cast(_col_chegada as timestamp) as dt_chegada,
                    try_cast(_col_chamada as timestamp) as dt_chamada,
                    -- Hardcoded for debug
                    'Unknown' as evento_descricao,
                    'Unknown' as situacao_descricao,
                    ts_ult
                FROM dedupped
            )
            , raw_today AS (
                SELECT 
                    gmo_id, 
                    placa_tracao, 
                    origem, 
                    cheguei, 
                    janela_agendamento, 
                    peso_saida,
                    evento_descricao,
                    situacao_descricao,
                    ts_ult
                FROM calc
                WHERE cheguei >= timestamp '${startDay}' 
                  AND cheguei <= timestamp '${endDay}'
                  AND janela_agendamento IS NOT NULL
            )
            , dedup_today AS (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn
                FROM raw_today
            )
            , base_final AS (
                SELECT * FROM dedup_today WHERE rn = 1
            )
            , agg_summary AS (
                SELECT 
                    count(*) as total_fila_hoje,
                    count(CASE WHEN date(janela_agendamento) = date(timestamp '${startDay}') THEN 1 END) as total_d,
                    count(CASE WHEN date(janela_agendamento) = date(timestamp '${startDay}') + interval '1' day THEN 1 END) as total_d1,
                    count(CASE WHEN cheguei < janela_agendamento THEN 1 END) as total_antecipados
                FROM base_final
            )
            , universe_stats AS (
                SELECT 
                    count(*) as total_raw_today,
                    count(CASE WHEN peso_saida IS NULL THEN 1 END) as raw_open,
                    count(CASE WHEN peso_saida IS NOT NULL THEN 1 END) as raw_closed
                FROM raw_today
            )
            -- Removed status_breakdown
            , d1_breakdown AS (
                SELECT 
                    hour(janela_agendamento) as h_window,
                    count(*) as cnt
                FROM base_final
                WHERE date(janela_agendamento) = date(timestamp '${startDay}') + interval '1' day
                GROUP BY 1
                ORDER BY 1
            )
            , sample_rows AS (
                SELECT 
                    gmo_id, placa_tracao, origem, cheguei, janela_agendamento, peso_saida, situacao_descricao, evento_descricao
                FROM base_final
                WHERE date(janela_agendamento) = date(timestamp '${startDay}') + interval '1' day
                ORDER BY cheguei DESC
                LIMIT 300
            )
            
            SELECT 'SUMMARY' as type, 
                   cast(total_fila_hoje as varchar) as v1, 
                   cast(total_d as varchar) as v2, 
                   cast(total_d1 as varchar) as v3, 
                   cast(total_antecipados as varchar) as v4,
                   '' as v5, '' as v6, '' as v7, '' as v8
            FROM agg_summary
            UNION ALL
            SELECT 'UNIVERSE' as type,
                   cast(total_raw_today as varchar) as v1,
                   cast(raw_open as varchar) as v2,
                   cast(raw_closed as varchar) as v3,
                   '' as v4, '' as v5, '' as v6, '' as v7, '' as v8
            FROM universe_stats
            UNION ALL
            SELECT 'BREAKDOWN' as type,
                   cast(h_window as varchar) as v1,
                   cast(cnt as varchar) as v2,
                   '' as v3, '' as v4, '' as v5, '' as v6, '' as v7, '' as v8
            FROM d1_breakdown
            UNION ALL
            SELECT 'SAMPLE' as type,
                   cast(gmo_id as varchar) as v1,
                   placa_tracao as v2,
                   origem as v3,
                   cast(cheguei as varchar) as v4,
                   cast(janela_agendamento as varchar) as v5,
                   cast(peso_saida as varchar) as v6,
                   situacao_descricao as v7,
                   evento_descricao as v8
            FROM sample_rows
        `;


        const results: ResultSet | undefined = await runQuery(query);
        interface AthenaRow {
            Data?: { VarCharValue?: string }[];
        }
        const rows: AthenaRow[] = (results?.Rows?.slice(1) || []) as AthenaRow[];

        interface SummaryData {
            total_fila_hoje: number;
            total_d: number;
            total_d1: number;
            total_antecipados: number;
            pct_antecipados: string;
        }

        interface UniverseData {
            total_raw_today: number;
            raw_open: number;
            raw_closed: number;
        }

        let summary: Partial<SummaryData> = {};
        let universe: Partial<UniverseData> = {};

        interface SampleItem {
            gmo_id: string;
            placa: string;
            origem: string;
            cheguei: string;
            janela: string;
            peso_saida: string;
            situacao: string;
            evento: string;
        }

        const status_stats: { status: string; count: number }[] = [];

        const breakdown: { h: number; count: number }[] = [];
        const sample: SampleItem[] = [];


        rows.forEach((r: AthenaRow) => {
            const data: string[] = r.Data?.map((d: { VarCharValue?: string }) => d.VarCharValue || '') || [];
            const type: string = data[0] || '';

            if (type === 'SUMMARY') {
                const total: number = parseInt(data[1] || '0');
                const antecipados: number = parseInt(data[4] || '0');
                summary = {
                    total_fila_hoje: total,
                    total_d: parseInt(data[2] || '0'),
                    total_d1: parseInt(data[3] || '0'),
                    total_antecipados: antecipados,
                    pct_antecipados: total > 0 ? (antecipados / total * 100).toFixed(1) : '0.0'
                };
            } else if (type === 'UNIVERSE') {
                universe = {
                    total_raw_today: parseInt(data[1] || '0'),
                    raw_open: parseInt(data[2] || '0'),
                    raw_closed: parseInt(data[3] || '0')
                };
            } else if (type === 'STATUS') {
                status_stats.push({ status: data[1], count: parseInt(data[2]) });
            } else if (type === 'BREAKDOWN') {
                breakdown.push({ h: parseInt(data[1] || '0'), count: parseInt(data[2] || '0') });
            } else if (type === 'SAMPLE') {
                sample.push({
                    gmo_id: data[1] || '',
                    placa: data[2] || '',
                    origem: data[3] || '',
                    cheguei: data[4] || '',
                    janela: data[5] || '',
                    peso_saida: data[6] || '',
                    situacao: data[7] || '',
                    evento: data[8] || ''
                });
            }
        });

    const response = {
      now_brt: brt.full,
      summary,
      universe,
      status_stats,
      breakdown,
      sample_count: sample.length,
      sample
    };

    setCached(cacheKey, response);
    return NextResponse.json(response);

    } catch (error) {
        console.error("Debug API Error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
