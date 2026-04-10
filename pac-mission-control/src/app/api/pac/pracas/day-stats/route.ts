import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE, getSchemaMap } from '@/lib/athena';
import { COMMON_CTES } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { getPracaSqlMapper } from '@/lib/pracas';
import { ResultSet, ColumnInfo, Row } from '@aws-sdk/client-athena';
import { getClientAthenaFilter } from '@/lib/client-filter';
import { getAllTargetsFor } from '@/lib/db';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const GLOBAL_META = 46.5333;

// Usando getSchemaMap global de @/lib/athena

export async function GET(request: Request): Promise<NextResponse> {
    try {
        const { searchParams } = new URL(request.url);
        const terminal = searchParams.get('terminal') || 'TRO';
        const produto = searchParams.get('produto');
        const cliente = searchParams.get('cliente');

        const cacheKey = `pac_pracas_day_stats_v2_${terminal}_${produto || 'all'}_${cliente || 'all'}`;
        const cachedData = getCached<any>(cacheKey);
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
        const clienteFilter = getClientAthenaFilter(terminal, cliente, 'c.cliente');
        const pracaMapper = getPracaSqlMapper(terminal, 'c.origem');

        // Target Logic
        const allTargets = getAllTargetsFor(terminal);
        const META_SQL = allTargets.length > 0
            ? `(CASE ${allTargets.map(t => `WHEN c.origem = '${t.origem.replace(/'/g, "''")}' THEN ${t.meta_h}`).join(' ')} ELSE ${GLOBAL_META} END)`
            : `${GLOBAL_META}`;

        const query = `
            ${COMMON_CTES(map, terminal)}
            , with_praca as (
                SELECT 
                    c.*,
                    ${pracaMapper} as praca_nome
                FROM calc c
            )
            , grouped_stats as (
                SELECT 
                    praca_nome,
                    avg(ciclo_total_h) as avg_h,
                    count(distinct gmo_id) as volume,
                    count(distinct CASE WHEN ciclo_total_h > ${META_SQL.replace(/c\.origem/g, 'praca_nome')} THEN gmo_id END) as count_above,
                    ${META_SQL.replace(/c\.origem/g, 'praca_nome')} as target_h
                FROM with_praca
                WHERE peso_saida >= timestamp '${startDay}' 
                  AND peso_saida <= timestamp '${endDay}'
                  ${produtoFilter}
                  ${clienteFilter}
                GROUP BY 1, 5
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
            const target_h = parseFloat(data[4]?.VarCharValue || GLOBAL_META.toString());

            return {
                praca,
                avg_h,
                volume,
                target_h,
                acima_meta_pct: volume > 0 ? (count_above / volume) * 100 : 0,
                status: avg_h <= target_h ? 'green' : avg_h <= target_h * 1.15 ? 'yellow' : 'red'
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
