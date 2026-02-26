import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE } from '@/lib/athena';
import { COMMON_CTES, getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { getPracaSqlMapper } from '@/lib/pracas';
import { ResultSet, ColumnInfo, Row } from '@aws-sdk/client-athena';

const CACHE_TTL = 60 * 1000; // 1 minute
const META_H = 46.5333; // 46h32m

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_v2';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;
    const result = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns = (result?.ResultSetMetadata?.ColumnInfo?.map((c: ColumnInfo) => c.Name) || []).filter((n: string | undefined | null): n is string => !!n);
    const map = getCleanMap(columns);
    setCached(cacheKey, map, 6 * 60 * 60 * 1000); // 6h
    return map;
}

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(request.url);
        const terminal = searchParams.get('terminal') || 'TRO';
        const produto = searchParams.get('produto');

        const cacheKey = `pac_pracas_day_stats_${terminal}_${produto || 'all'}`;
        const cachedData = getCached(cacheKey);
        if (cachedData) return NextResponse.json(cachedData);

        const map = await getSchemaMap();
        
        // 1. Calculate Today Boundaries in BRT (00h..23h)
        const now = new Date();
        const fmt = (options: Intl.DateTimeFormatOptions): string => 
            new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', ...options }).format(now);
        
        const ymd = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
        const startDay = `${ymd} 00:00:00`;
        const endDay = `${ymd} 23:59:59`;

        const produtoFilter = produto ? `AND c.produto = '${produto}'` : '';
        const pracaMapper = getPracaSqlMapper(terminal, 'c.origem');

        const query = `
            ${COMMON_CTES(map, terminal)}
            , grouped_stats as (
                SELECT 
                    ${pracaMapper} as praca_nome,
                    avg(c.ciclo_total_h) as avg_h,
                    count(distinct c.gmo_id) as volume,
                    count(distinct CASE WHEN c.ciclo_total_h > ${META_H} THEN gmo_id END) as count_above
                FROM calc c
                WHERE c.peso_saida >= timestamp '${startDay}' 
                  AND c.peso_saida <= timestamp '${endDay}'
                  ${produtoFilter}
                GROUP BY 1
            )
            SELECT * FROM grouped_stats
            ORDER BY volume DESC
        `;

        const results: ResultSet | undefined = await runQuery(query);
        const rows = results?.Rows?.slice(1) || [];

        const items = rows.map((r: Row) => {
            const data = r.Data || [];
            const praca = data[0]?.VarCharValue || 'OUTROS';
            const avg_h = parseFloat(data[1]?.VarCharValue || '0');
            const volume = parseInt(data[2]?.VarCharValue || '0');
            const count_above = parseInt(data[3]?.VarCharValue || '0');

            return {
                praca,
                avg_h,
                volume,
                acima_meta_pct: volume > 0 ? (count_above / volume) * 100 : 0,
                status: avg_h <= META_H ? 'green' : avg_h <= META_H * 1.15 ? 'yellow' : 'red'
            };
        });

        const response = {
            terminal,
            date: ymd,
            updated_at: new Date().toISOString(),
            items
        };

        setCached(cacheKey, response, CACHE_TTL);
        return NextResponse.json(response);

    } catch (error) {
        console.error("Pracas Day Stats API Error:", error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}
