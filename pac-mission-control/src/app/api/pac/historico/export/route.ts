import { NextRequest } from "next/server";
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from "@/lib/athena";
import { getCleanMap } from "@/lib/athena-sql";
import { getCached, setCached } from "@/lib/cache";
import { applyPracaFilter } from "@/lib/pracas";
import { VehicleItem } from "@/lib/types";

export const dynamic = 'force-dynamic';

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_export_v1';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) return cached;
    
    const result = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns = result?.ResultSetMetadata?.ColumnInfo?.map((c: { Name?: string }) => c.Name).filter((n?: string): n is string => !!n) || [];
    const map = getCleanMap(columns);
    
    setCached(cacheKey, map, 6 * 60 * 60 * 1000);
    return map;
}

export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const terminal = sp.get('terminal') || 'TRO';
    const startDate = sp.get('startDate');
    const endDate = sp.get('endDate');
    const produto = sp.get('produto');
    const praca = sp.get('praca') || 'TODAS';

    if (!startDate || !endDate) {
        return Response.json({ error: "Missing date range" }, { status: 400 });
    }

    try {
        const map = await getSchemaMap();
        const pracaFilter = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
        
        const sql = `
            ${pracaFilter.cte}
            ${pracaFilter.cte ? ',' : 'WITH'} raw_data AS (
                SELECT 
                    ${map.id} as gmo_id,
                    ${map.terminal} as terminal,
                    ${map.origem} as origem,
                    ${map.produto} as produto,
                    ${map.placa} as placa_tracao,
                    COALESCE(${map.cliente}, 'Desconhecido') as cliente,
                    try_cast(${map.dt_peso_saida} as timestamp) as peso_saida,
                    
                    try_cast(${map.dt_cheguei} as timestamp) as dt_cheguei,
                    try_cast(${map.dt_chamada} as timestamp) as dt_chamada,
                    try_cast(${map.dt_chegada} as timestamp) as dt_chegada,
                    try_cast(${map.dt_agendamento} as timestamp) as dt_agendamento,
                    try_cast(${map.dt_emissao} as timestamp) as dt_emissao,
                    try_cast(${map.dt_janela} as timestamp) as dt_janela,
                    try_cast(${map.dt_peso_saida} as timestamp) as dt_peso_saida,

                    date_diff('second', try_cast(${map.dt_emissao} as timestamp), try_cast(${map.dt_peso_saida} as timestamp)) / 3600.0 as ciclo_total_h,
                    date_diff('second', try_cast(${map.dt_cheguei} as timestamp), try_cast(${map.dt_chamada} as timestamp)) / 3600.0 as tempo_area_verde_h,
                    date_diff('second', try_cast(${map.dt_chegada} as timestamp), try_cast(${map.dt_peso_saida} as timestamp)) / 3600.0 as ciclo_interno_h,
                    date_diff('second', try_cast(${map.dt_agendamento} as timestamp), try_cast(${map.dt_chegada} as timestamp)) / 3600.0 as tempo_viagem_h,
                    date_diff('second', try_cast(${map.dt_emissao} as timestamp), try_cast(${map.dt_agendamento} as timestamp)) / 3600.0 as aguardando_agendamento_h,
                    
                    greatest(
                        coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
                        coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
                        coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
                    ) as ts_ult
                FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" base
                ${pracaFilter.join}
                WHERE base.${map.terminal} = '${terminal}'
            ),
            dedupped AS (
                SELECT * FROM (
                    SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn
                    FROM raw_data
                ) WHERE rn = 1
            )
            SELECT * FROM dedupped
            WHERE peso_saida >= from_iso8601_timestamp('${startDate}T00:00:00-03:00')
              AND peso_saida <= from_iso8601_timestamp('${endDate}T23:59:59-03:00')
              AND ciclo_total_h IS NOT NULL
              ${produto ? `AND produto = '${produto}'` : ''}
            ORDER BY peso_saida DESC
        `;

        const result = await runQuery(sql);
        const vehicles: VehicleItem[] = [];
        
        if (result && result.Rows && result.Rows.length > 1) {
            result.Rows.slice(1).forEach((r: { Data?: { VarCharValue?: string }[] }) => {
                const d = r.Data;
                if (!d) return;
                const f = (idx: number) => parseFloat(d[idx]?.VarCharValue || '0');
                vehicles.push({
                    gmo_id: d[0]?.VarCharValue || '',
                    placa: d[4]?.VarCharValue || '',
                    origem: d[2]?.VarCharValue || '',
                    produto: d[3]?.VarCharValue || '',
                    cliente: d[5]?.VarCharValue || '',
                    ciclo_total_h: parseFloat(f(14).toFixed(1)),
                    h_verde: parseFloat(f(15).toFixed(1)),
                    h_interno: parseFloat(f(16).toFixed(1)),
                    h_viagem: parseFloat(f(17).toFixed(1)),
                    h_aguardando: parseFloat(f(18).toFixed(1)),
                    dt_emissao: d[11]?.VarCharValue,
                    dt_agendamento: d[10]?.VarCharValue,
                    dt_janela: d[12]?.VarCharValue,
                    dt_cheguei: d[7]?.VarCharValue,
                    dt_chamada: d[8]?.VarCharValue,
                    dt_chegada: d[9]?.VarCharValue,
                    dt_peso_saida: d[13]?.VarCharValue
                });
            });
        }

        return Response.json({ vehicles });

    } catch (e: any) {
        console.error("Export API Error:", e);
        return Response.json({ error: e.message }, { status: 500 });
    }
}
