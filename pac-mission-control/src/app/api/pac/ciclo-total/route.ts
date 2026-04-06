import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE, getSchemaMap } from '@/lib/athena';
import { COMMON_CTES } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';
import { getHistoryStats } from '@/lib/db';
import { syncFinishedGMOs } from '@/lib/sync-gmo';
import { getClientAthenaFilter } from '@/lib/client-filter';

// Helper to get BRT components
function getBRTComponents(date: Date): { full: string; ymd: string; h: string; m: string; s: string; year: string; month: string; day: string } {
    const fmt = (options: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...options }).format(date);
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
        const cliente: string | null = searchParams.get('cliente');

        const CACHE_KEY: string = `pac_ciclo_total_v3_${terminal}_${produto || 'all'}_${praca || 'all'}_${cliente || 'all'}`;
        const cachedData = getCached<any>(CACHE_KEY);
        if (cachedData) return NextResponse.json(cachedData);

        const map: Record<string, string> = await getSchemaMap();
        const META_H: number = 46.5333; // 46h32m

        const now: Date = new Date();
        const brt = getBRTComponents(now);

        // SYNC: Garantir que os dados de ontem/hoje estejam no SQLite
        try {
            await syncFinishedGMOs(terminal);
        } catch (e) {
            console.error("[Athena-Cost-Reduction] Falha na sincronização silenciosa:", e);
        }

        // Boundaries
        const startDay: string = `${brt.ymd} 00:00:00`;
        const endDay: string = `${brt.ymd} 23:59:59`;
        const startMonth: string = `${brt.year}-${brt.month}-01 00:00:00`;
        const startYear: string = `${brt.year}-01-01 00:00:00`;

        // 1. DADOS HISTÓRICOS (SQLite - CUSTO ZERO)
        const histMes = getHistoryStats(terminal, startMonth, startDay, { produto: produto || undefined, cliente: cliente || undefined });
        const histAno = getHistoryStats(terminal, startYear, startDay, { produto: produto || undefined, cliente: cliente || undefined });

        // 2. DELTA DE HOJE (Athena - ESCANEIA APENAS UM DIA)
        const pracaFilter = applyPracaFilter(terminal, praca, 'calc.origem');
        const produtoFilter = produto ? `AND produto = '${produto}'` : '';
        const clienteFilter = getClientAthenaFilter(terminal, cliente, 'cliente');
        
        // Define buckets for the last 4 hours (Today/Current)
        const subHours = (d: Date, h: number): Date => new Date(d.getTime() - h * 60 * 60 * 1000);
        const buckets = [0, 1, 2, 3].map((i: number) => {
            const d = subHours(now, i);
            const c = getBRTComponents(d);
            return { i, start: `${c.ymd} ${c.h}:00:00`, end: `${c.ymd} ${c.h}:59:59`, label: `${c.h}h` };
        });

        const query: string = `
            ${COMMON_CTES(map, terminal, '')}
            ${pracaFilter.cte}
            , today_stats as (
                 SELECT
                    ${buckets.map(b => `
                    count(distinct CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' THEN gmo_id END) as h${b.i}_vol,
                    avg(CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' THEN ciclo_total_h END) as h${b.i}_avg,
                    count(distinct CASE WHEN peso_saida >= timestamp '${b.start}' AND peso_saida <= timestamp '${b.end}' AND ciclo_total_h > ${META_H} THEN gmo_id END) as h${b.i}_above
                    `).join(',\n')},
                    count(distinct gmo_id) as d_vol,
                    avg(ciclo_total_h) as d_avg,
                    count(distinct CASE WHEN ciclo_total_h > ${META_H} THEN gmo_id END) as d_above,
                    max(peso_saida) as last_update
                 FROM calc
                 ${pracaFilter.join}
                 WHERE peso_saida >= timestamp '${startDay}' 
                   AND peso_saida <= timestamp '${endDay}'
                   ${produtoFilter}
                   ${clienteFilter}
            )
            SELECT * FROM today_stats
        `;

        console.log(`[Athena-Cost-Reduction] Executando Delta Query (Hoje)...`);
        const results: ResultSet | undefined = await runQuery(query);
        const rowData = results?.Rows?.[1]?.Data;

        if (!rowData) return NextResponse.json({ error: 'Data unavailable' }, { status: 500 });
        const p = (i: number): number => parseFloat(rowData[i]?.VarCharValue || '0');

        // Choose best hour bucket
        let chosenH = { vol: 0, avg: 0, above: 0, label: buckets[0].label, isFallback: false };
        for (let i = 0; i < 4; i++) {
            const vol = p(i * 3);
            if (vol > 0) {
                chosenH = { vol, avg: p(i * 3 + 1), above: p(i * 3 + 2), label: i === 0 ? buckets[i].label : `${buckets[i].label} (Fallback)`, isFallback: i > 0 };
                break;
            }
        }

        const d_vol = p(12), d_avg = p(13), d_above = p(14);
        const last_ts = rowData[15]?.VarCharValue;

        // 3. MERGE HISTORICO + HOJE
        const mergeBuckets = (hist: {vol: number, avg_h: number, above_meta: number}, today: {vol: number, avg_h: number, above_meta: number}) => {
            const totalVol = (hist.vol || 0) + (today.vol || 0);
            const totalAbove = (hist.above_meta || 0) + (today.above_meta || 0);
            const totalAvg = totalVol > 0 ? (((hist.avg_h || 0) * (hist.vol || 0)) + ((today.avg_h || 0) * (today.vol || 0))) / totalVol : 0;
            return { vol: totalVol, avg: totalAvg, above: totalAbove };
        };

        const mesMerged = mergeBuckets(histMes, { vol: d_vol, avg_h: d_avg, above_meta: d_above });
        const anoMerged = mergeBuckets(histAno, { vol: d_vol, avg_h: d_avg, above_meta: d_above });

        const mkBucket = (label: string, avg: number, vol: number, above: number, isFallback = false) => ({
            label, avg_h: avg, volume: vol, acima_meta_count: above,
            acima_meta_pct: vol > 0 ? (above / vol * 100) : 0,
            delta_meta_h: vol > 0 ? (avg - META_H) : 0,
            is_fallback: isFallback
        });

        const response = {
            terminal,
            updated_at: new Date().toISOString(),
            telemetry: { max_peso_saida: last_ts, now_brt: brt.full, strategy: 'HYBRID_LOCAL_ATHENA' },
            ciclo_total: {
                hora_atual: mkBucket(chosenH.label, chosenH.avg, chosenH.vol, chosenH.above, chosenH.isFallback),
                dia: mkBucket('Dia', d_avg, d_vol, d_above),
                mes: mkBucket('Mês', mesMerged.avg, mesMerged.vol, mesMerged.above),
                ano: mkBucket('Ano', anoMerged.avg, anoMerged.vol, anoMerged.above)
            }
        };

        setCached(CACHE_KEY, response, 15 * 60 * 1000);
        return NextResponse.json(response);
    } catch (error) {
        console.error("Ciclo Total API Error:", error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}

