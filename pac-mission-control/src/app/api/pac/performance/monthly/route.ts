import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE } from '@/lib/athena';
import { COMMON_CTES, getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { getPracaSqlMapper } from '@/lib/pracas';
import { ResultSet, ColumnInfo, Row } from '@aws-sdk/client-athena';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const META_H = 40.0; // Meta 40h for Cockpit Premium

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_v2';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;
    const result = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns = (result?.ResultSetMetadata?.ColumnInfo?.map((c: ColumnInfo) => c.Name) || []).filter((n: string | undefined | null): n is string => !!n);
    const map = getCleanMap(columns);
    setCached(cacheKey, map, 6 * 60 * 60 * 1000); 
    return map;
}

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(request.url);
        const terminal = searchParams.get('terminal') || 'TRO';
        const produto = searchParams.get('produto');

        const cacheKey = `pac_performance_monthly_v4_${terminal}_${produto || 'all'}`;
        const cachedData = getCached(cacheKey);
        if (cachedData) return NextResponse.json(cachedData);

        const map = await getSchemaMap();
        
        // Month Boundaries
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] + ' 00:00:00';
        const endOfMonth = now.toISOString().split('T')[0] + ' 23:59:59';

        const produtoFilter = produto ? `AND c.produto = '${produto}'` : '';
        const pracaMapper = getPracaSqlMapper(terminal, 'c.origem');

        const query = `
            ${COMMON_CTES(map, terminal)}
            , monthly_stats as (
                SELECT 
                    avg(c.ciclo_total_h) as avg_h,
                    count(distinct c.gmo_id) as total_volume,
                    count(distinct CASE WHEN c.ciclo_total_h <= ${META_H} THEN gmo_id END) as volume_target,
                    min(c.ciclo_total_h) as best_case
                FROM calc c
                WHERE c.peso_saida >= timestamp '${startOfMonth}' 
                  AND c.peso_saida <= timestamp '${endOfMonth}'
                  ${produtoFilter}
            )
            , praca_stats as (
                SELECT 
                    ${pracaMapper} as praca_nome,
                    count(distinct c.gmo_id) as volume,
                    
                    -- Cycle Total (Less is Better)
                    avg(c.ciclo_total_h) as avg_h,
                    min(c.ciclo_total_h) as best_case_total,
                    approx_percentile(c.ciclo_total_h, 0.75) as p75_total,
                    approx_percentile(c.ciclo_total_h, 0.25) as p25_total,
                    approx_percentile(c.ciclo_total_h, 0.10) as p10_total,

                    -- Agendamento (Less is Better)
                    avg(c.aguardando_agendamento_h) as avg_agend,
                    approx_percentile(c.aguardando_agendamento_h, 0.75) as p75_agend,
                    approx_percentile(c.aguardando_agendamento_h, 0.25) as p25_agend,
                    approx_percentile(c.aguardando_agendamento_h, 0.10) as p10_agend,

                    -- Viagem (Less is Better)
                    avg(c.tempo_viagem_h) as avg_viagem,
                    approx_percentile(c.tempo_viagem_h, 0.75) as p75_viagem,
                    approx_percentile(c.tempo_viagem_h, 0.25) as p25_viagem,
                    approx_percentile(c.tempo_viagem_h, 0.10) as p10_viagem,

                    -- Área Verde (N/A for percentiles in simple avg sense but let's keep consistency)
                    avg(c.area_verde_cheguei_h) as avg_verde,
                    approx_percentile(c.area_verde_cheguei_h, 0.75) as p75_verde,
                    approx_percentile(c.area_verde_cheguei_h, 0.25) as p25_verde,
                    approx_percentile(c.area_verde_cheguei_h, 0.10) as p10_verde,

                    -- Interno (Less is Better)
                    avg(c.tempo_interno_h) as avg_interno,
                    approx_percentile(c.tempo_interno_h, 0.75) as p75_interno,
                    approx_percentile(c.tempo_interno_h, 0.25) as p25_interno,
                    approx_percentile(c.tempo_interno_h, 0.10) as p10_interno,

                    -- Antecipação (MORE is Better)
                    -- For Antecipacao, "Elite P10" = Best 10% = 90th Percentile
                    -- "Bench P25" = Best 25% = 75th Percentile
                    -- "Resto 75%" = Bottom 75% (the value below which only 25% of trucks fall) = 25th Percentile
                    avg(case when c.is_antecipado = 1 then c.antecipacao_h end) as avg_antecip,
                    approx_percentile(case when c.is_antecipado = 1 then c.antecipacao_h end, 0.25) as p75_antecip, -- Resto
                    approx_percentile(case when c.is_antecipado = 1 then c.antecipacao_h end, 0.75) as p25_antecip, -- Bench
                    approx_percentile(case when c.is_antecipado = 1 then c.antecipacao_h end, 0.90) as p10_antecip  -- Elite

                FROM calc c
                WHERE c.peso_saida >= timestamp '${startOfMonth}' 
                  AND c.peso_saida <= timestamp '${endOfMonth}'
                  ${produtoFilter}
                GROUP BY 1
            )
            SELECT 
                (SELECT avg_h FROM monthly_stats) as total_avg,
                (SELECT total_volume FROM monthly_stats) as total_vol,
                (SELECT volume_target FROM monthly_stats) as vol_target,
                (SELECT best_case FROM monthly_stats) as total_best,
                p.*
            FROM praca_stats p
            ORDER BY p.volume DESC
        `;

        const results: ResultSet | undefined = await runQuery(query);
        const rows = results?.Rows?.slice(1) || [];

        if (rows.length === 0) {
            return NextResponse.json({ items: [], summary: {} });
        }

        const firstRow = rows[0].Data || [];
        const summary = {
            avg_h: parseFloat(firstRow[0]?.VarCharValue || '0'),
            total_volume: parseInt(firstRow[1]?.VarCharValue || '0'),
            target_volume: parseInt(firstRow[2]?.VarCharValue || '0'),
            best_case: parseFloat(firstRow[3]?.VarCharValue || '0'),
            meta: META_H
        };

        const pracas = rows.map((r: Row) => {
            const d = r.Data || [];
            return {
                name: d[4]?.VarCharValue || 'OUTROS',
                volume: parseInt(d[5]?.VarCharValue || '0'),
                avg_h: parseFloat(d[6]?.VarCharValue || '0'),
                best_case: parseFloat(d[7]?.VarCharValue || '0'),
                percentiles: {
                    p75: parseFloat(d[8]?.VarCharValue || '0'),
                    p25: parseFloat(d[9]?.VarCharValue || '0'),
                    p10: parseFloat(d[10]?.VarCharValue || '0'),
                },
                stages: {
                    agendamento: {
                        avg: parseFloat(d[11]?.VarCharValue || '0'),
                        p75: parseFloat(d[12]?.VarCharValue || '0'),
                        p25: parseFloat(d[13]?.VarCharValue || '0'),
                        p10: parseFloat(d[14]?.VarCharValue || '0'),
                    },
                    viagem: {
                        avg: parseFloat(d[15]?.VarCharValue || '0'),
                        p75: parseFloat(d[16]?.VarCharValue || '0'),
                        p25: parseFloat(d[17]?.VarCharValue || '0'),
                        p10: parseFloat(d[18]?.VarCharValue || '0'),
                    },
                    area_verde: {
                        avg: parseFloat(d[19]?.VarCharValue || '0'),
                        p75: parseFloat(d[20]?.VarCharValue || '0'),
                        p25: parseFloat(d[21]?.VarCharValue || '0'),
                        p10: parseFloat(d[22]?.VarCharValue || '0'),
                    },
                    interno: {
                        avg: parseFloat(d[23]?.VarCharValue || '0'),
                        p75: parseFloat(d[24]?.VarCharValue || '0'),
                        p25: parseFloat(d[25]?.VarCharValue || '0'),
                        p10: parseFloat(d[26]?.VarCharValue || '0'),
                    },
                    antecipacao: {
                        avg: parseFloat(d[27]?.VarCharValue || '0'),
                        p75: parseFloat(d[28]?.VarCharValue || '0'),
                        p25: parseFloat(d[29]?.VarCharValue || '0'),
                        p10: parseFloat(d[30]?.VarCharValue || '0'),
                    }
                }
            };
        });

        const response = {
            terminal,
            range: 'month',
            summary,
            pracas
        };

        setCached(cacheKey, response, CACHE_TTL);
        return NextResponse.json(response);

    } catch (error) {
        console.error("Monthly Performance API Error:", error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
