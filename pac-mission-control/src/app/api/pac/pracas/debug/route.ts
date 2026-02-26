import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/athena';
import { getMunicipiosByPraca, sqlNormalizeExpr, normalizeCity } from '@/lib/pracas';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const terminal = searchParams.get('terminal');
    const praca = searchParams.get('praca');

    if (!terminal || !praca) {
        return NextResponse.json({ error: 'Terminal and praca are required' }, { status: 400 });
    }

    try {
        const municipiosRaw = getMunicipiosByPraca(terminal, praca);
        // They are already normalized by normalizeCity when ingested from Excel, but we map them just to be safe in the output format.
        const municipiosNorm = municipiosRaw.map(m => m);

        // Fetch sample of origens from today from VW_Ciclo
        const ATHENA_DATABASE = process.env.ATHENA_DATABASE;
        const TARGET_VIEW = process.env.ATHENA_VIEW || 'vw_ciclo';

        const sqlSample = `
            SELECT DISTINCT origem 
            FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" 
            WHERE terminal = '${terminal.toUpperCase()}'
              AND peso_saida >= date_trunc('day', current_timestamp AT TIME ZONE 'America/Sao_Paulo')
            LIMIT 50
        `;
        const sampleResult = await runQuery(sqlSample);
        const vwOrigensTodaySample = (sampleResult?.Rows?.slice(1) || []).map((r: any) => r.Data[0]?.VarCharValue || '');
        const vwOrigensNormSample = vwOrigensTodaySample.map((o: string) => normalizeCity(o));

        // Intersection count
        const intersectionSample = vwOrigensNormSample.filter((o: string) => municipiosNorm.includes(o));
        const intersectionCount = intersectionSample.length;

        // SQL Test
        const sqlTestTotal = `
            SELECT COUNT(DISTINCT gmo_id) as c
            FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" 
            WHERE terminal = '${terminal.toUpperCase()}'
              AND peso_saida >= date_trunc('day', current_timestamp AT TIME ZONE 'America/Sao_Paulo')
        `;
        const totalResult = await runQuery(sqlTestTotal);
        const countTodayTotal = totalResult?.Rows?.[1]?.Data?.[0]?.VarCharValue || 0;

        const municipiosSqlList = municipiosNorm.map(m => `('${m.replace(/'/g, "''")}')`).join(',');
        
        let countTodayFiltered = 0;
        if (municipiosNorm.length > 0) {
            const sqlTestFiltered = `
                WITH municipios AS (
                    SELECT * FROM (VALUES ${municipiosSqlList}) AS t(mun_norm)
                )
                SELECT COUNT(DISTINCT gmo_id) as c
                FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
                JOIN municipios m ON m.mun_norm = ${sqlNormalizeExpr('base.origem')}
                WHERE terminal = '${terminal.toUpperCase()}'
                  AND peso_saida >= date_trunc('day', current_timestamp AT TIME ZONE 'America/Sao_Paulo')
            `;
            const filteredResult = await runQuery(sqlTestFiltered);
            countTodayFiltered = filteredResult?.Rows?.[1]?.Data?.[0]?.VarCharValue || 0;
        }

        return NextResponse.json({
            terminal,
            praca,
            municipios_raw_count: municipiosRaw.length,
            municipios_norm_sample: municipiosNorm.slice(0, 5),
            vw_origens_today_sample: vwOrigensTodaySample,
            vw_origens_norm_sample: vwOrigensNormSample,
            intersection_count: intersectionCount,
            intersection_sample: intersectionSample,
            sql_test: {
                count_today_total: Number(countTodayTotal),
                count_today_filtered: Number(countTodayFiltered)
            }
        });
    } catch (e: any) {
        console.error("[API Pracas Debug] Error", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
