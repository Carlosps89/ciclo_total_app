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

        const cacheKey = `pac_performance_monthly_${terminal}_${produto || 'all'}`;
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
                    avg(c.ciclo_total_h) as avg_h,
                    min(c.ciclo_total_h) as best_case,
                    count(distinct c.gmo_id) as volume,
                    
                    -- Percentiles for Cycle Total
                    approx_percentile(c.ciclo_total_h, 0.75) as p75_total,
                    approx_percentile(c.ciclo_total_h, 0.25) as p25_total,
                    approx_percentile(c.ciclo_total_h, 0.10) as p10_total,

                    -- Stages averages
                    avg(c.aguardando_agendamento_h) as avg_agend,
                    avg(c.tempo_viagem_h) as avg_viagem,
                    avg(case when c.is_area_verde = 'Sim' then c.tempo_interno_h end) as avg_verde,
                    avg(c.tempo_interno_h) as avg_interno,
                    avg(case when c.is_antecipado = 1 then c.ciclo_total_h end) as avg_antecip

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
                p.praca_nome,
                p.avg_h as praca_avg,
                p.best_case as praca_best,
                p.volume as praca_vol,
                p.p75_total, p.p25_total, p.p10_total,
                p.avg_agend, p.avg_viagem, p.avg_verde, p.avg_interno, p.avg_antecip
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
            const data = r.Data || [];
            return {
                name: data[4]?.VarCharValue || 'OUTROS',
                avg_h: parseFloat(data[5]?.VarCharValue || '0'),
                best_case: parseFloat(data[6]?.VarCharValue || '0'),
                volume: parseInt(data[7]?.VarCharValue || '0'),
                percentiles: {
                    p75: parseFloat(data[8]?.VarCharValue || '0'),
                    p25: parseFloat(data[9]?.VarCharValue || '0'),
                    p10: parseFloat(data[10]?.VarCharValue || '0'),
                },
                stages: {
                    agendamento: parseFloat(data[11]?.VarCharValue || '0'),
                    viagem: parseFloat(data[12]?.VarCharValue || '0'),
                    area_verde: parseFloat(data[13]?.VarCharValue || '0'),
                    interno: parseFloat(data[14]?.VarCharValue || '0'),
                    antecipacao: parseFloat(data[15]?.VarCharValue || '0'),
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
        return NextResponse.json({ error: 'Failed to fetch performance' }, { status: 500 });
    }
}
