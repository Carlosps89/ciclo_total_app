import { NextRequest } from "next/server";
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from "@/lib/athena";
import { COMMON_CTES, getCleanMap } from "@/lib/athena-sql";
import { getCached, setCached } from "@/lib/cache";
import { applyPracaFilter, getPracaSqlMapper } from "@/lib/pracas";

export const dynamic = 'force-dynamic';

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_v5';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;
    
    const result = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns = result?.ResultSetMetadata?.ColumnInfo?.map((c: { Name: string }) => c.Name).filter((n: string | undefined): n is string => !!n) || [];
    const map = getCleanMap(columns);
    
    setCached(cacheKey, map, 6 * 60 * 60 * 1000);
    return map;
}

export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const terminal = sp.get('terminal') || 'TRO';
    const startDate = sp.get('startDate');
    const endDate = sp.get('endDate');
    const pracaFilterParam = sp.get('praca') || 'TODAS';
    const produtoFilterParam = sp.get('produto');
    const municipiosParam = sp.get('municipios'); // Comma-separated list

    if (!startDate || !endDate) {
        return Response.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Cache Key Generation based on all filters
    const cacheKey = `cockpit_v4_5_${terminal}_${startDate}_${endDate}_${pracaFilterParam}_${produtoFilterParam || 'NONE'}_${municipiosParam || 'ALL'}`;
    const cachedResponse = getCached<any>(cacheKey);
    if (cachedResponse) {
        console.log(`[CockpitAPI] Cache Hit: ${cacheKey}`);
        return Response.json(cachedResponse);
    }

    const t0 = Date.now();
    try {
        const map = await getSchemaMap();
        const pracaFilter = applyPracaFilter(terminal, pracaFilterParam, 'calc.origem');
        const produtoFilter = produtoFilterParam ? `AND produto = '${produtoFilterParam}'` : '';
        const pracaMapper = getPracaSqlMapper(terminal, 'calc.origem');
        
        let municipiosFilter = '';
        if (municipiosParam && municipiosParam !== 'ALL') {
            const cities = municipiosParam.split(',').map(c => `'${c.trim()}'`).join(',');
            municipiosFilter = `AND calc.origem IN (${cities})`;
        }
        const sql = `
            ${COMMON_CTES(map, terminal, '', { start: startDate, end: endDate })}
            ${pracaFilter.cte}
            
            , period_data AS (
                SELECT 
                    calc.*,
                    ${pracaMapper} as group_praca,
                    CASE WHEN ciclo_total_h <= 40 THEN 1 ELSE 0 END as is_within_target,
                    -- Anticipation calculation (hours)
                    CASE WHEN cheguei < janela_agendamento THEN date_diff('second', cheguei, janela_agendamento) / 3600.0 ELSE 0 END as tempo_antecipacao_h
                FROM calc
                ${pracaFilter.join}
                WHERE terminal = '${terminal}'
                  ${produtoFilter}
                  ${municipiosFilter}
                  AND peso_saida >= timestamp '${startDate} 00:00:00'
                  AND peso_saida <= timestamp '${endDate} 23:59:59'
                  AND ciclo_total_h IS NOT NULL
            ),
            period_data_ranked AS (
                SELECT 
                    *,
                    -- Window functions to rank for P25 (Top Tier) calculation per stage
                    ROW_NUMBER() OVER(PARTITION BY group_praca ORDER BY ciclo_total_h ASC) as rank_praca,
                    COUNT(*) OVER(PARTITION BY group_praca) as count_praca,
                    
                    -- Specific ranks for stages (best to worst)
                    ROW_NUMBER() OVER(PARTITION BY group_praca ORDER BY coalesce(aguardando_agendamento_h, 999) ASC) as rank_agendamento,
                    ROW_NUMBER() OVER(PARTITION BY group_praca ORDER BY coalesce(tempo_viagem_h, 999) ASC) as rank_viagem,
                    ROW_NUMBER() OVER(PARTITION BY group_praca ORDER BY coalesce(area_verde_cheguei_h, 999) ASC) as rank_verde,
                    ROW_NUMBER() OVER(PARTITION BY group_praca ORDER BY coalesce(tempo_interno_h, 999) ASC) as rank_interno,

                    -- Anticipation ranks
                    ROW_NUMBER() OVER(PARTITION BY group_praca ORDER BY CASE WHEN cheguei < janela_agendamento THEN date_diff('second', cheguei, janela_agendamento) / 3600.0 ELSE 0 END DESC) as rank_antecipacao,

                    ROW_NUMBER() OVER(PARTITION BY produto ORDER BY ciclo_total_h ASC) as rank_produto,
                    COUNT(*) OVER(PARTITION BY produto) as count_produto,
                    ROW_NUMBER() OVER(ORDER BY ciclo_total_h ASC) as rank_global,
                    COUNT(*) OVER() as count_global
                FROM period_data
            ),
            global_summary AS (
                SELECT 
                    COUNT(*) as vol_total,
                    SUM(is_within_target) as vol_within,
                    COUNT(*) - SUM(is_within_target) as vol_above,
                    AVG(ciclo_total_h) as real_avg,
                    AVG(CASE WHEN rank_global <= (count_global * 0.25) THEN ciclo_total_h END) as best_case_avg
                FROM period_data_ranked
            ),
            praca_perf AS (
                SELECT 
                    group_praca as label,
                    COUNT(*) as vol,
                    SUM(is_within_target) as vol_within,
                    COUNT(*) - SUM(is_within_target) as vol_above,
                    
                    -- Aaggregrate city list for filtering
                    array_join(array_agg(DISTINCT origem), ',') as city_list,

                    -- Total averages
                    AVG(ciclo_total_h) as real_avg,
                    AVG(CASE WHEN rank_praca <= (count_praca * 0.25) THEN ciclo_total_h END) as best_avg,
                    AVG(CASE WHEN rank_praca <= (count_praca * 0.10) THEN ciclo_total_h END) as p10_avg,
                    
                    -- Stage real averages
                    AVG(aguardando_agendamento_h) as real_agendamento,
                    AVG(tempo_viagem_h) as real_viagem,
                    AVG(area_verde_cheguei_h) as real_verde,
                    AVG(tempo_interno_h) as real_interno,

                    -- Stage benchmarks (P25)
                    AVG(CASE WHEN rank_agendamento <= (count_praca * 0.25) THEN aguardando_agendamento_h END) as best_agendamento,
                    AVG(CASE WHEN rank_viagem <= (count_praca * 0.25) THEN tempo_viagem_h END) as best_viagem,
                    AVG(CASE WHEN rank_verde <= (count_praca * 0.25) THEN area_verde_cheguei_h END) as best_verde,
                    AVG(CASE WHEN rank_interno <= (count_praca * 0.25) THEN tempo_interno_h END) as best_interno,

                    -- Stage benchmarks (P10)
                    AVG(CASE WHEN rank_agendamento <= (count_praca * 0.10) THEN aguardando_agendamento_h END) as p10_agendamento,
                    AVG(CASE WHEN rank_viagem <= (count_praca * 0.10) THEN tempo_viagem_h END) as p10_viagem,
                    AVG(CASE WHEN rank_verde <= (count_praca * 0.10) THEN area_verde_cheguei_h END) as p10_verde,
                    AVG(CASE WHEN rank_interno <= (count_praca * 0.10) THEN tempo_interno_h END) as p10_interno,

                    -- Stage benchmarks (Others 75%)
                    AVG(CASE WHEN rank_praca > (count_praca * 0.25) THEN ciclo_total_h END) as others_avg,
                    AVG(CASE WHEN rank_agendamento > (count_praca * 0.25) THEN aguardando_agendamento_h END) as others_agendamento,
                    AVG(CASE WHEN rank_viagem > (count_praca * 0.25) THEN tempo_viagem_h END) as others_viagem,
                    AVG(CASE WHEN rank_verde > (count_praca * 0.25) THEN area_verde_cheguei_h END) as others_verde,
                    AVG(CASE WHEN rank_interno > (count_praca * 0.25) THEN tempo_interno_h END) as others_interno,

                    -- Anticipation Metrics
                    AVG(tempo_antecipacao_h) as real_antecipacao,
                    AVG(CASE WHEN rank_antecipacao <= (count_praca * 0.25) THEN tempo_antecipacao_h END) as best_antecipacao,
                    AVG(CASE WHEN rank_antecipacao <= (count_praca * 0.10) THEN tempo_antecipacao_h END) as p10_antecipacao,
                    AVG(CASE WHEN rank_antecipacao > (count_praca * 0.25) THEN tempo_antecipacao_h END) as others_antecipacao
                    
                FROM period_data_ranked
                GROUP BY group_praca
            ),
            product_perf AS (
                SELECT 
                    produto as label,
                    COUNT(*) as vol,
                    AVG(ciclo_total_h) as real_avg,
                    AVG(CASE WHEN rank_produto <= (count_produto * 0.25) THEN ciclo_total_h END) as best_avg
                FROM period_data_ranked
                GROUP BY produto
            )
            SELECT 'GLOBAL' as type, 'GLOBAL' as label, vol_total, real_avg, best_case_avg as best_avg, vol_within, vol_above, 0,0,0,0,0,0,0,0,0,0,0,0,0, '', 0,0,0, 0,0,0,0,0,0 FROM global_summary
            UNION ALL
            SELECT 'PRACA' as type, label, vol, real_avg, best_avg, vol_within, vol_above, 
                   real_agendamento, real_viagem, real_verde, real_interno,
                   best_agendamento, best_viagem, best_verde, best_interno,
                   p10_avg, p10_agendamento, p10_viagem, p10_verde, p10_interno,
                   city_list, real_antecipacao, best_antecipacao, p10_antecipacao,
                   others_avg, others_agendamento, others_viagem, others_verde, others_interno, others_antecipacao
            FROM praca_perf
            UNION ALL
            SELECT 'PRODUTO' as type, label, vol, real_avg, best_avg, 0, 0, 0,0,0,0,0,0,0,0,0,0,0,0,0, '', 0,0,0, 0,0,0,0,0,0 FROM product_perf
        `;

        const res = await runQuery(sql);
        if (!res || !res.Rows || res.Rows.length <= 1) {
             const emptyResponse = { target_premium: 40, real_avg: 0, vol_total: 0, pracas: [], products: [] };
             setCached(cacheKey, emptyResponse, 30 * 1000); // Short cache for empty
             return Response.json(emptyResponse);
        }

        const rows = res.Rows.slice(1);
        const globalRow = rows.find((r: { Data: { VarCharValue?: string }[] }) => r.Data[0].VarCharValue === 'GLOBAL');
        
        const parseMetrics = (row: { Data: { VarCharValue?: string }[] }) => {
            const real = parseFloat(parseFloat(row.Data[3].VarCharValue || '0').toFixed(1));
            const best = parseFloat(parseFloat(row.Data[4].VarCharValue || '40').toFixed(1));
            const p10 = parseFloat(parseFloat(row.Data[15]?.VarCharValue || '0').toFixed(1));
            const othersAvg = parseFloat(parseFloat(row.Data[24]?.VarCharValue || '0').toFixed(1));
            
            const stages = row.Data.length > 7 ? {
                agendamento: { 
                   real: parseFloat(parseFloat(row.Data[7].VarCharValue || '0').toFixed(1)),
                   best: parseFloat(parseFloat(row.Data[11].VarCharValue || '0').toFixed(1)),
                   p10: parseFloat(parseFloat(row.Data[16]?.VarCharValue || '0').toFixed(1)),
                   others: parseFloat(parseFloat(row.Data[25]?.VarCharValue || '0').toFixed(1))
                },
                viagem: { 
                   real: parseFloat(parseFloat(row.Data[8].VarCharValue || '0').toFixed(1)), 
                   best: parseFloat(parseFloat(row.Data[12].VarCharValue || '0').toFixed(1)),
                   p10: parseFloat(parseFloat(row.Data[17]?.VarCharValue || '0').toFixed(1)),
                   others: parseFloat(parseFloat(row.Data[26]?.VarCharValue || '0').toFixed(1))
                },
                verde: { 
                   real: parseFloat(parseFloat(row.Data[9].VarCharValue || '0').toFixed(1)), 
                   best: parseFloat(parseFloat(row.Data[13].VarCharValue || '0').toFixed(1)),
                   p10: parseFloat(parseFloat(row.Data[18]?.VarCharValue || '0').toFixed(1)),
                   others: parseFloat(parseFloat(row.Data[27]?.VarCharValue || '0').toFixed(1))
                },
                interno: { 
                   real: parseFloat(parseFloat(row.Data[10].VarCharValue || '0').toFixed(1)), 
                   best: parseFloat(parseFloat(row.Data[14].VarCharValue || '0').toFixed(1)),
                   p10: parseFloat(parseFloat(row.Data[19]?.VarCharValue || '0').toFixed(1)),
                   others: parseFloat(parseFloat(row.Data[28]?.VarCharValue || '0').toFixed(1))
                },
                antecipacao: {
                    real: parseFloat(parseFloat(row.Data[21]?.VarCharValue || '0').toFixed(1)),
                    best: parseFloat(parseFloat(row.Data[22]?.VarCharValue || '0').toFixed(1)),
                    p10: parseFloat(parseFloat(row.Data[23]?.VarCharValue || '0').toFixed(1)),
                    others: parseFloat(parseFloat(row.Data[29]?.VarCharValue || '0').toFixed(1))
                }
            } : undefined;

            return {
                label: row.Data[1].VarCharValue || 'N/A',
                vol: parseInt(row.Data[2].VarCharValue || '0'),
                real_avg: real,
                best_avg: best,
                p10_avg: p10,
                others_avg: othersAvg,
                vol_within: parseInt(row.Data[5].VarCharValue || '0'),
                vol_above: parseInt(row.Data[6].VarCharValue || '0'),
                delta: parseFloat((real - best).toFixed(1)),
                city_list: row.Data[20]?.VarCharValue ? row.Data[20].VarCharValue.split(',') : [],
                stages
            };
        };

        const pracas = rows.filter((r: { Data: { VarCharValue?: string }[] }) => r.Data[0].VarCharValue === 'PRACA')
            .map(parseMetrics)
            .sort((a: { vol: number }, b: { vol: number }) => b.vol - a.vol);

        const products = rows.filter((r: { Data: { VarCharValue?: string }[] }) => r.Data[0].VarCharValue === 'PRODUTO')
            .map(parseMetrics)
            .sort((a: { delta: number }, b: { delta: number }) => b.delta - a.delta);

        const realAvg = parseFloat(parseFloat(globalRow?.Data[3].VarCharValue || '0').toFixed(1));
        const target = 40;
        
        const attainment = realAvg > 0 ? Math.max(0, Math.min(100, (target / realAvg) * 100)) : 0;

        const finalResult = {
            target_premium: target,
            real_avg: realAvg,
            attainment: parseFloat(attainment.toFixed(1)),
            best_in_period: parseFloat(parseFloat(globalRow?.Data[4].VarCharValue || '40').toFixed(1)),
            vol_total: parseInt(globalRow?.Data[2].VarCharValue || '0'),
            vol_within: parseInt(globalRow?.Data[5].VarCharValue || '0'),
            vol_above: parseInt(globalRow?.Data[6].VarCharValue || '0'),
            pracas,
            products
        };

        console.log(`[CockpitAPI] Data Fetched and Processed in ${Date.now() - t0}ms`);
        // Cache result for 1 hour
        setCached(cacheKey, finalResult, 60 * 60 * 1000);

        return Response.json(finalResult);

    } catch (e: unknown) {
        console.error("Impact Analysis V4.2 Error:", e);
        const msg = e instanceof Error ? e.message : String(e);
        return Response.json({ error: msg }, { status: 500 });
    }
}
