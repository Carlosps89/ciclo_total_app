import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE } from '@/lib/athena';
import { COMMON_CTES, getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey: string = 'schema_map_v2';
    const cached: Record<string, string> | null = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;
    const result: ResultSet | undefined = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns: string[] = result?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [];
    const map: Record<string, string> = getCleanMap(columns);
    setCached(cacheKey, map, 6 * 60 * 60 * 1000);
    return map;
}

// Helper to get BRT components
function getBRTComponents(date: Date): { full: string; ymd: string; h: string; m: string; s: string; year: string; month: string; day: string } {
    const fmt = (options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...options }).format(date);
    // en-CA gives YYYY-MM-DD
    const ymd: string = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
    const h: string = fmt({ hour: '2-digit', hour12: false });
    const m: string = fmt({ minute: '2-digit' });
    const s: string = fmt({ second: '2-digit' });

    return {
        full: `${ymd} ${h}:${m}:${s}`,
        ymd, h, m, s,
        year: ymd.substring(0, 4),
        month: ymd.substring(5, 7),
        day: ymd.substring(8, 10)
    };
}

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const { searchParams }: URL = new URL(request.url);
        const terminal: string = searchParams.get('terminal') || 'TRO';
        const produto: string | null = searchParams.get('produto');
        const praca: string | null = searchParams.get('praca');
        const debug: string | null = searchParams.get('debug');

        // CACHE LAYER (30s)
        const CACHE_KEY: string = `pac_ciclo_total_v2_${terminal}_${produto || 'all'}_${praca || 'all'}`;
        const cached: unknown = getCached<unknown>(CACHE_KEY);
        if (cached) {
            // Add header to indicate cache hit if desired, but here just return
            return NextResponse.json(cached);
        }

        const map: Record<string, string> = await getSchemaMap();
        const META_H: number = 46.5333; // 46h32m

        // 1. Calculate Time Boundaries in BRT
        const now: Date = new Date();
        const brt = getBRTComponents(now);

        // Fallback Logic: Calculate 4 hourly buckets (Clock Hours: XX:00:00 to XX:59:59)
        // Helper to subtract hours
        const subHours = (d: Date, h: number): Date => new Date(d.getTime() - h * 60 * 60 * 1000);

        interface Bucket {
            i: number;
            start: string;
            end: string;
            label: string;
        }

        const buckets: Bucket[] = [0, 1, 2, 3].map((i: number): Bucket => {
            const d: Date = subHours(now, i);
            const c = getBRTComponents(d);
            return {
                i,
                start: `${c.ymd} ${c.h}:00:00`,
                end: `${c.ymd} ${c.h}:59:59`,
                label: `${c.h}h`
            };
        });

        const startDay: string = `${brt.ymd} 00:00:00`;
        const endDay: string = `${brt.ymd} 23:59:59`;
        const startMonth: string = `${brt.year}-${brt.month}-01 00:00:00`;
        const startYear: string = `${brt.year}-01-01 00:00:00`;

        console.log(`DEBUG: Ciclo Query. H0=${buckets[0].start}`);
        const produtoFilter = produto ? `AND produto = '${produto}'` : '';
        
        const pracaFilter = applyPracaFilter(terminal, praca, 'calc.origem');
        if (pracaFilter.isNoMatch) {
            const mkEmptyBucket = (label: string) => ({
                label, avg_h: 0, volume: 0, acima_meta_count: 0, acima_meta_pct: 0, delta_meta_h: 0, is_fallback: false
            });
            return NextResponse.json({
                terminal,
                updated_at: now.toISOString(),
                telemetry: { max_peso_saida: null, now_brt: brt.full, window_type: 'FALLBACK_CLOCK_HOUR' },
                ciclo_total: {
                    hora_atual: mkEmptyBucket(buckets[0].label),
                    dia: mkEmptyBucket('Dia'),
                    mes: mkEmptyBucket('Mês'),
                    ano: mkEmptyBucket('Ano')
                },
                debug_praca_warning: pracaFilter.warning
            });
        }

        const query: string = `
            ${COMMON_CTES(map, terminal)}
            ${pracaFilter.cte}
            , current_stats as (
                 SELECT
                    -- HOUR BUCKETS (0 to 3)
                    ${buckets.map((b: Bucket) => `
                    count(distinct CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' THEN gmo_id END) as h${b.i}_vol,
                    avg(CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' THEN ciclo_total_h END) as h${b.i}_avg,
                    count(distinct CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' AND ciclo_total_h > ${META_H} THEN gmo_id END) as h${b.i}_above,
                    `).join('\n')}

                    -- DAY Bucket
                    count(distinct CASE WHEN peso_saida >= timestamp '${startDay}' AND peso_saida <= timestamp '${endDay}' THEN gmo_id END) as d_vol,
                    avg(CASE WHEN peso_saida >= timestamp '${startDay}' AND peso_saida <= timestamp '${endDay}' THEN ciclo_total_h END) as d_avg,
                    count(distinct CASE WHEN peso_saida >= timestamp '${startDay}' AND peso_saida <= timestamp '${endDay}' AND ciclo_total_h > ${META_H} THEN gmo_id END) as d_above,
                    
                    -- MONTH Bucket (Start to Now)
                    count(distinct CASE WHEN peso_saida >= timestamp '${startMonth}' THEN gmo_id END) as m_vol,
                    avg(CASE WHEN peso_saida >= timestamp '${startMonth}' THEN ciclo_total_h END) as m_avg,
                    count(distinct CASE WHEN peso_saida >= timestamp '${startMonth}' AND ciclo_total_h > ${META_H} THEN gmo_id END) as m_above,

                    -- YEAR Bucket (Start to Now)
                    count(distinct CASE WHEN peso_saida >= timestamp '${startYear}' THEN gmo_id END) as y_vol,
                    avg(CASE WHEN peso_saida >= timestamp '${startYear}' THEN ciclo_total_h END) as y_avg,
                    count(distinct CASE WHEN peso_saida >= timestamp '${startYear}' AND ciclo_total_h > ${META_H} THEN gmo_id END) as y_above,
                    
                    max(peso_saida) as last_update
                 FROM calc
                 ${pracaFilter.join}
                 WHERE peso_saida >= timestamp '${startYear}'
                   AND peso_saida IS NOT NULL
                   ${produtoFilter}
            )
            SELECT * FROM current_stats
        `;

        console.log("DEBUG: Executing Robust Ciclo Query (Fallback Logic)...");
        const results: ResultSet | undefined = await runQuery(query);
        interface Datum { VarCharValue?: string }
        const row: Datum[] | undefined = results?.Rows?.[1]?.Data;

        if (!row) return NextResponse.json({});

        const p = (i: number): number => parseFloat(row[i]?.VarCharValue || '0');
        const s = (i: number): string | undefined => row[i]?.VarCharValue;

        // Logic to pick Best Hour Bucket (first non-zero volume)
        interface ChosenHour {
            vol: number;
            avg: number;
            above: number;
            label: string;
            isFallback: boolean;
        }

        let chosenH: ChosenHour = { vol: 0, avg: 0, above: 0, label: buckets[0].label, isFallback: false };

        // H0 is at index 0,1,2; H1 at 3,4,5; etc.
        for (let i: number = 0; i < 4; i++) {
            const vol: number = p(i * 3);
            if (vol > 0) {
                chosenH = {
                    vol,
                    avg: p(i * 3 + 1),
                    above: p(i * 3 + 2),
                    label: i === 0 ? buckets[i].label : `${buckets[i].label} (Fallback)`,
                    isFallback: i > 0
                };
                break;
            }
        }
        // If all 0, defaults to H0 (already set)

        const baseIdx: number = 4 * 3; // 12 columns for H0..H3
        const d_vol: number = p(baseIdx), d_avg: number = p(baseIdx + 1), d_above: number = p(baseIdx + 2);
        const m_vol: number = p(baseIdx + 3), m_avg: number = p(baseIdx + 4), m_above: number = p(baseIdx + 5);
        const y_vol: number = p(baseIdx + 6), y_avg: number = p(baseIdx + 7), y_above: number = p(baseIdx + 8);
        const last_ts: string | undefined = s(baseIdx + 9);

        // Helper
        interface BucketResponse {
            label: string;
            avg_h: number;
            volume: number;
            acima_meta_count: number;
            acima_meta_pct: number;
            delta_meta_h: number;
            is_fallback: boolean;
        }

        const mkBucket = (label: string, avg: number, vol: number, above: number, isFallback: boolean = false): BucketResponse => ({
            label,
            avg_h: avg,
            volume: vol,
            acima_meta_count: above,
            acima_meta_pct: vol > 0 ? (above / vol * 100) : 0,
            delta_meta_h: vol > 0 ? (avg - META_H) : 0,
            is_fallback: isFallback
        });

        const response = {

            terminal,
            updated_at: new Date().toISOString(),
            telemetry: {
                max_peso_saida: last_ts,
                now_brt: brt.full,
                window_type: 'FALLBACK_CLOCK_HOUR'
            },
            ciclo_total: {
                hora_atual: mkBucket(chosenH.label, chosenH.avg, chosenH.vol, chosenH.above, chosenH.isFallback),
                dia: mkBucket('Dia', d_avg, d_vol, d_above),
                mes: mkBucket('Mês', m_avg, m_vol, m_above),
                ano: mkBucket('Ano', y_avg, y_vol, y_above)
            }
        };

        // DEBUG / SANITY CHECK
        console.log(`[CICLO-TOTAL-HOUR] terminal=${terminal} now_brt=${brt.full} max_peso_saida=${last_ts} window=${chosenH.label} volume=${chosenH.vol}`);

        // Set Cache (30s)
        setCached(CACHE_KEY, response, 30 * 1000);

        return NextResponse.json(response);
    } catch (error) {
        console.error("Ciclo Total API Error:", error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

