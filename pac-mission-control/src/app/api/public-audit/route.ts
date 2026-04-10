import { NextRequest } from "next/server";
import { runQuery, ATHENA_DATABASE } from "@/lib/athena";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const sql = `
        WITH base AS (
            SELECT 
                try_cast(peso_saida as timestamp) as dt_peso_saida,
                try_cast(emissao_nota as timestamp) as dt_emissao,
                date_diff('second', try_cast(emissao_nota as timestamp), try_cast(peso_saida as timestamp)) / 3600.0 as ciclo_total_h,
                gmo_id
            FROM ${ATHENA_DATABASE}.vw_ciclo
            WHERE try_cast(peso_saida as timestamp) >= timestamp '2026-04-01 00:00:00'
        ),
        dedupped AS (
            SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY dt_peso_saida DESC) as rn
            FROM base
        )
        SELECT 
            count(*) as total_records,
            count(CASE WHEN ciclo_total_h IS NOT NULL THEN 1 END) as valid_cycles,
            avg(ciclo_total_h) as avg_all,
            avg(CASE WHEN ciclo_total_h > 0 THEN ciclo_total_h END) as avg_positive,
            avg(CASE WHEN ciclo_total_h > 0 AND ciclo_total_h < 100 THEN ciclo_total_h END) as avg_positive_under_100h,
            count(CASE WHEN ciclo_total_h < 0 THEN 1 END) as negative_cycles,
            count(CASE WHEN ciclo_total_h = 0 THEN 1 END) as zero_cycles,
            count(CASE WHEN ciclo_total_h > 100 THEN 1 END) as huge_cycles,
            avg(CASE WHEN ciclo_total_h < 0 THEN ciclo_total_h END) as avg_negative
        FROM dedupped
        WHERE rn = 1
    `;
    
    try {
        const result = await runQuery(sql);
        let audit = {};
        if (result && result.Rows && result.Rows.length > 1) {
            const h = result.Rows[0].Data.map(d => d.VarCharValue);
            const r = result.Rows[1].Data.map(d => d.VarCharValue);
            for(let i=0; i<h.length; i++) {
                audit[h[i]] = r[i];
            }
        }
        return Response.json(audit);
    } catch(e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}
