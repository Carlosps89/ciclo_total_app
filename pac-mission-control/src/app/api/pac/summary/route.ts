import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE, getSchemaMap } from '@/lib/athena';
import { COMMON_CTES, getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

const CACHE_TTL: number = 15 * 60 * 1000; // 15 minutes

// Remoção da função local getSchemaMap pois agora usamos a global de @/lib/athena

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const { searchParams }: URL = new URL(request.url);
        const terminal: string = searchParams.get('terminal') || 'TRO';
        const produto: string | null = searchParams.get('produto');
        const praca: string | null = searchParams.get('praca');
        const debug: string | null = searchParams.get('debug');

        const cacheKey: string = `pac_summary_${terminal}_${produto || 'all'}_${praca || 'all'}`;
        const cachedData = getCached<any>(cacheKey);
        if (cachedData) return NextResponse.json(cachedData);

        const map: Record<string, string> = await getSchemaMap();
        
        const pracaFilterMain = applyPracaFilter(terminal, praca, 'c.origem');
        if (pracaFilterMain.isNoMatch) {
            return NextResponse.json({
                stages: {
                    aguardando_agendamento: { volume: 0, avg_h: 0, p90_h: 0, status: 'green' },
                    tempo_viagem: { volume: 0, avg_h: 0, p90_h: 0, status: 'green' },
                    tempo_interno: { volume: 0, avg_h: 0, p90_h: 0, status: 'green' }
                },
                debug_praca_warning: pracaFilterMain.warning
            });
        }
        
        const produtoFilterCalc = produto ? `AND c.produto = '${produto}'` : '';
        const produtoFilterRaw = produto ? `AND ${map.produto} = '${produto}'` : '';

        // Query: Last 24h Summary
        const query: string = `
      ${COMMON_CTES(map, terminal)}
      ${pracaFilterMain.cte}
      SELECT
        -- Aguardando Agendamento
        avg(c.aguardando_agendamento_h) as avg_wait,
        approx_percentile(c.aguardando_agendamento_h, 0.90) as p90_wait,
        count(c.gmo_id) as count_wait,
        
        -- Tempo Viagem
        avg(c.tempo_viagem_h) as avg_travel,
        approx_percentile(c.tempo_viagem_h, 0.90) as p90_travel,
        count(c.gmo_id) as count_travel,
        
        -- Tempo Interno
        avg(c.tempo_interno_h) as avg_internal,
        approx_percentile(c.tempo_interno_h, 0.90) as p90_internal,
        count(c.gmo_id) as count_internal

      FROM calc c
      ${pracaFilterMain.join}
      WHERE c.peso_saida > date_add('day', -1, date_add('hour', -4, now())) 
        ${produtoFilterCalc}
    `;

        // Parallel: Meta Query (Max Timestamps) using VW_Ciclo for Global Freshness
        const TARGET_VIEW_META: string = 'VW_Ciclo';
        const mapMeta: Record<string, string> = await getSchemaMap(TARGET_VIEW_META);

        const pracaFilterMeta = applyPracaFilter(terminal, praca, `base.${mapMeta.origem}`, true);

        const metaQuery: string = `
            ${pracaFilterMeta.cte}
            SELECT 
                max(try_cast(${mapMeta.dt_peso_saida} as timestamp)) as max_saida, 
                max(try_cast(${mapMeta.dt_cheguei} as timestamp)) as max_cheguei
            FROM "${ATHENA_DATABASE}"."${TARGET_VIEW_META}" base
            ${pracaFilterMeta.join}
            WHERE base.${mapMeta.terminal} = '${terminal}'
              ${produtoFilterRaw.replace(map.produto, `base.${mapMeta.produto}`)}
              AND (
                   try_cast(${mapMeta.dt_cheguei} as timestamp) >= date_add('day', -7, date_add('hour', -4, now()))
                  OR                   try_cast(${mapMeta.dt_peso_saida} as timestamp) >= date_add('day', -7, date_add('hour', -4, now()))
              )
        `;


        const [results, metaResults]: [ResultSet | undefined, ResultSet | undefined] = await Promise.all([
            runQuery(query),
            runQuery(metaQuery).catch(err => {
                console.warn("[Summary] Meta Query (Timestamps) Failed:", err.message);
                return undefined;
            })
        ]);

        interface Datum { VarCharValue?: string }
        const row: Datum[] | undefined = results?.Rows?.[1]?.Data;
        const metaRow: Datum[] | undefined = metaResults?.Rows?.[1]?.Data;

        if (!row) return NextResponse.json({});

        const parse = (idx: number): number => parseFloat(row[idx]?.VarCharValue || '0');

        const rawLastPeso: string | null = metaRow?.[0]?.VarCharValue || null;
        const rawLastCheguei: string | null = metaRow?.[1]?.VarCharValue || null;

        const now: Date = new Date();
        const panelTimeISO: string = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).format(now).replace(',', '');

        // Thresholds (in Hours)
        // TODO: move to config file. Hardcoded for robustness in this snippet.
        const metas: { aguardando: number; viagem: number; interno: number } = {
            aguardando: 2.0,
            viagem: 5.0,
            interno: 1.0
        };

        const getStatus = (val: number, meta: number): string => {
            if (val <= meta) return 'green';
            if (val <= meta * 1.25) return 'yellow';
            return 'red';
        };

        const waitVal: number = parse(0);
        const travelVal: number = parse(3);
        const internalVal: number = parse(6);

        const response = {
            terminal,
            updated_at: new Date().toISOString(),
            meta: {
                panel_updated_at_brt: panelTimeISO,
                aws_last_peso_saida_brt: rawLastPeso ? rawLastPeso.substring(0, 16) : null,
                aws_last_cheguei_brt: rawLastCheguei ? rawLastCheguei.substring(0, 16) : null,
                athena_cache_expires_at: new Date(Date.now() + CACHE_TTL).toISOString()
            },
            stages: {
                aguardando_agendamento: {
                    stage: 'Aguardando Agendamento',
                    avg_h: waitVal,
                    p90_h: parse(1),
                    volume: parse(2),
                    meta_h: metas.aguardando,
                    status: getStatus(waitVal, metas.aguardando)
                },
                tempo_viagem: {
                    stage: 'Tempo de Viagem',
                    avg_h: travelVal,
                    p90_h: parse(4),
                    volume: parse(5),
                    meta_h: metas.viagem,
                    status: getStatus(travelVal, metas.viagem)
                },
                tempo_interno: {
                    stage: 'Tempo Interno',
                    avg_h: internalVal,
                    p90_h: parse(7),
                    volume: parse(8),
                    meta_h: metas.interno,
                    status: getStatus(internalVal, metas.interno)
                }
            }
        };

        setCached(cacheKey, response, CACHE_TTL);
        return NextResponse.json(response);

    } catch (error) {
        console.error("Summary API Error:", error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}
