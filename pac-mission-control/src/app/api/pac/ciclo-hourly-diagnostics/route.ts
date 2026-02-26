import { NextRequest } from "next/server";
import { runQuery, ATHENA_DATABASE, ATHENA_VIEW } from "@/lib/athena";
import { COMMON_CTES, getCleanMap } from "@/lib/athena-sql";
import { getCached, setCached } from "@/lib/cache";
import { applyPracaFilter } from "@/lib/pracas";
import { VehicleItem } from "@/lib/types";

export const dynamic = 'force-dynamic';

async function getSchemaMap(): Promise<Record<string, string>> {
    const cacheKey = 'schema_map_v4';
    const cached = getCached<Record<string, string>>(cacheKey);
    if (cached) {
        if (!cached.cliente) cached.cliente = 'cliente';
        return cached;
    }
    const result = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`);
    const columns = result?.ResultSetMetadata?.ColumnInfo?.map((c: any) => c.Name).filter((n: any): n is string => !!n) || [];
    console.log(`[HourlyDiagnostics] Colunas encontradas em ${ATHENA_VIEW}:`, columns.join(', '));
    const map = getCleanMap(columns);
    
    setCached(cacheKey, map, 6 * 60 * 60 * 1000);
    return map;
}

export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const terminal = sp.get('terminal') || 'TRO';
    const dateResult = sp.get('date');
    const hourParam = sp.get('hour');
    const produto = sp.get('produto');
    const praca = sp.get('praca') || 'TODAS';

    const now = new Date();
    const todayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
    const targetDate = dateResult || todayStr;

    try {
        const map = await getSchemaMap();
        console.log(`[HourlyDiagnostics] Schema Map Final para ${terminal}:`, JSON.stringify(map));
        const cacheKeyPrefix = `diag_v5_${terminal}_${praca}_${targetDate}_${produto || 'all'}`;
        
        // Extrai partes da data para Partition Pruning
        const [y, m, d_part] = targetDate.split('-');
        const partitionFilter = `AND ano = ${parseInt(y)} AND mes = ${parseInt(m)} AND dia = ${parseInt(d_part)}`;

        let hourlyData: any[] = [];
        let topWorst: any[] = [];
        let metaHoras = 46.53;

        // Tenta pegar o base (gráfico) do cache primeiro
        const cachedBase = getCached<any>(cacheKeyPrefix);
        let hourlySqlPromise: Promise<any> | null = null;

        const pracaFilterEarly = applyPracaFilter(terminal, praca, 'calc.origem');
        if (pracaFilterEarly.isNoMatch) {
            return Response.json({
                date: targetDate, terminal, meta_horas: metaHoras,
                hourly: Array.from({ length: 24 }).map((_, i) => ({ hour: i, volume: 0, ciclo_medio: null, delta_h: null })),
                top_worst_hours: [], drawer: null
            });
        }

        const produtoFilterCalc = produto ? `AND produto = '${produto}'` : '';

        if (cachedBase) {
            hourlyData = cachedBase.hourly;
            topWorst = cachedBase.top_worst_hours;
        } else {
            // Apply Partition Pruning directly in the base table scan inside COMMON_CTES
            const hourlySql = `
                ${COMMON_CTES(map, terminal, partitionFilter)}
                ${pracaFilterEarly.cte}
                , base AS (
                    SELECT hour(peso_saida) as h, ciclo_total_h, gmo_id
                    FROM calc
                    ${pracaFilterEarly.join}
                    WHERE terminal = '${terminal}'
                      ${produtoFilterCalc}
                      AND peso_saida >= timestamp '${targetDate} 00:00:00'
                      AND peso_saida <= timestamp '${targetDate} 23:59:59'
                      AND ciclo_total_h IS NOT NULL
                )
                SELECT h, COUNT(DISTINCT gmo_id) as volume, AVG(ciclo_total_h) as ciclo_medio
                FROM base GROUP BY h ORDER BY h
            `;
            hourlySqlPromise = runQuery(hourlySql);
        }

        // -------------------------------------------------------------
        // DRAWER (If hour is provided) - UNIFIED QUERY
        // -------------------------------------------------------------
        let drawerData = null;
        let unifiedDrawerPromise: Promise<any> | null = null;

        if (hourParam) {
            const h = parseInt(hourParam);
            const drawerCacheKey = `${cacheKeyPrefix}_h${h}`;
            const cachedDrawer = getCached<any>(drawerCacheKey);

            if (cachedDrawer) {
                drawerData = cachedDrawer;
            } else {
                const pracaFilterCustom = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
                const unifiedSql = `
                ${pracaFilterCustom.cte}
                ${pracaFilterCustom.cte ? ',' : 'WITH'} raw_data AS (
                    SELECT 
                        ${map.id} as gmo_id, ${map.terminal} as terminal, ${map.origem} as origem, ${map.produto} as produto, ${map.placa} as placa_tracao, COALESCE(${map.cliente}, 'Desconhecido') as cliente,
                        try_cast(${map.dt_peso_saida} as timestamp) as dt_peso_saida,
                        try_cast(${map.dt_cheguei} as timestamp) as dt_cheguei, try_cast(${map.dt_chamada} as timestamp) as dt_chamada, try_cast(${map.dt_chegada} as timestamp) as dt_chegada, try_cast(${map.dt_agendamento} as timestamp) as dt_agendamento, try_cast(${map.dt_emissao} as timestamp) as dt_emissao, try_cast(${map.dt_janela} as timestamp) as dt_janela,
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
                    ${pracaFilterCustom.join}
                    WHERE base.${map.terminal} = '${terminal}'
                      AND base.ano = ${parseInt(y)} AND base.mes = ${parseInt(m)} AND base.dia = ${parseInt(d_part)}
                      AND try_cast(${map.dt_peso_saida} as timestamp) >= timestamp '${targetDate} 00:00:00'
                      AND try_cast(${map.dt_peso_saida} as timestamp) <= timestamp '${targetDate} 23:59:59'
                      ${produto ? `AND ${map.produto} = '${produto}'` : ''}
                ),
                dedupped AS (
                    SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn FROM raw_data) WHERE rn = 1
                ),
                day_base AS (
                    SELECT *, hour(dt_peso_saida) as h FROM dedupped
                    WHERE ciclo_total_h IS NOT NULL
                ),
                summary AS (
                    SELECT 
                        'SUMMARY' as type, 
                        CAST(AVG(ciclo_total_h) as VARCHAR) as v1, 
                        CAST(AVG(tempo_area_verde_h) as VARCHAR) as v2, 
                        CAST(AVG(ciclo_interno_h) as VARCHAR) as v3, 
                        CAST(AVG(tempo_viagem_h) as VARCHAR) as v4, 
                        CAST(AVG(aguardando_agendamento_h) as VARCHAR) as v5, 
                        CAST(AVG(CASE WHEN h = ${h} THEN tempo_area_verde_h END) as VARCHAR) as v6, 
                        CAST(AVG(CASE WHEN h = ${h} THEN ciclo_interno_h END) as VARCHAR) as v7, 
                        CAST(AVG(CASE WHEN h = ${h} THEN tempo_viagem_h END) as VARCHAR) as v8, 
                        CAST(AVG(CASE WHEN h = ${h} THEN aguardando_agendamento_h END) as VARCHAR) as v9, 
                        CAST(AVG(CASE WHEN h = ${h} THEN ciclo_total_h END) as VARCHAR) as v10, 
                        CAST(COUNT(DISTINCT CASE WHEN h = ${h} THEN gmo_id END) as VARCHAR) as v11,
                        '' as v12, '' as v13, '' as v14, '' as v15, '' as v16, '' as v17
                    FROM day_base
                ),
                dims AS (
                    SELECT * FROM (
                        SELECT 'DIM_ORIGEM' as type, origem as v1, CAST(COUNT(DISTINCT CASE WHEN h = ${h} THEN gmo_id END) as VARCHAR) as v2, CAST(COUNT(DISTINCT gmo_id) as VARCHAR) as v3, CAST(AVG(ciclo_total_h) as VARCHAR) as v4, '' as v5, '' as v6, '' as v7, '' as v8, '' as v9, '' as v10, '' as v11, '' as v12, '' as v13, '' as v14, '' as v15, '' as v16, '' as v17 FROM day_base GROUP BY 2
                        UNION ALL SELECT 'DIM_PRODUTO' as type, produto as v1, CAST(COUNT(DISTINCT CASE WHEN h = ${h} THEN gmo_id END) as VARCHAR) as v2, CAST(COUNT(DISTINCT gmo_id) as VARCHAR) as v3, CAST(AVG(ciclo_total_h) as VARCHAR) as v4, '' as v5, '' as v6, '' as v7, '' as v8, '' as v9, '' as v10, '' as v11, '' as v12, '' as v13, '' as v14, '' as v15, '' as v16, '' as v17 FROM day_base GROUP BY 2
                        UNION ALL SELECT 'DIM_CLIENTE' as type, cliente as v1, CAST(COUNT(DISTINCT CASE WHEN h = ${h} THEN gmo_id END) as VARCHAR) as v2, CAST(COUNT(DISTINCT gmo_id) as VARCHAR) as v3, CAST(AVG(ciclo_total_h) as VARCHAR) as v4, '' as v5, '' as v6, '' as v7, '' as v8, '' as v9, '' as v10, '' as v11, '' as v12, '' as v13, '' as v14, '' as v15, '' as v16, '' as v17 FROM day_base GROUP BY 2
                    )
                ),
                vehicles AS (
                    SELECT 
                        'VEHICLE' as type, CAST(gmo_id as VARCHAR) as v1, placa_tracao as v2, origem as v3, produto as v4, cliente as v5, 
                        CAST(ciclo_total_h as VARCHAR) as v6, CAST(tempo_area_verde_h as VARCHAR) as v7, CAST(ciclo_interno_h as VARCHAR) as v8, CAST(tempo_viagem_h as VARCHAR) as v9, CAST(aguardando_agendamento_h as VARCHAR) as v10,
                        CAST(dt_emissao as VARCHAR) as v11, CAST(dt_agendamento as VARCHAR) as v12, CAST(dt_janela as VARCHAR) as v13, CAST(dt_cheguei as VARCHAR) as v14, CAST(dt_chamada as VARCHAR) as v15, CAST(dt_chegada as VARCHAR) as v16, CAST(dt_peso_saida as VARCHAR) as v17
                    FROM day_base WHERE h = ${h}
                )
                SELECT * FROM summary 
                UNION ALL SELECT * FROM dims
                UNION ALL SELECT * FROM vehicles
                `;
                unifiedDrawerPromise = runQuery(unifiedSql);
            }
        }

        // AGUARDA TUDO EM PARALELO
        console.log(`[HourlyDiagnostics] Inciando consultas para ${terminal} - ${targetDate} (Hour: ${hourParam})`);
        const startTime = Date.now();
        const allResults = await Promise.all([
            hourlySqlPromise || Promise.resolve(null),
            unifiedDrawerPromise || Promise.resolve(null)
        ]);
        console.log(`[HourlyDiagnostics] Consultas finalizadas em ${Date.now() - startTime}ms`);

        const hrResult = allResults[0];

        // Processa Hourly (Gráfico)
        if (hrResult) {
            const hourlyMap = new Map<number, { volume: number, ciclo_medio: number, delta_h: number }>();
            if (hrResult.Rows && hrResult.Rows.length > 1) {
                hrResult.Rows.slice(1).forEach((r: any) => {
                    const hour = parseInt(r.Data[0].VarCharValue || '0');
                    const vol = parseInt(r.Data[1].VarCharValue || '0');
                    const avg = parseFloat(r.Data[2].VarCharValue || '0');
                    hourlyMap.set(hour, { volume: vol, ciclo_medio: parseFloat(avg.toFixed(1)), delta_h: parseFloat((avg - metaHoras).toFixed(1)) });
                });
            }
            hourlyData = [];
            for(let i=0; i<24; i++) {
                if(hourlyMap.has(i)) hourlyData.push({ hour: i, ...hourlyMap.get(i)! });
                else hourlyData.push({ hour: i, volume: 0, ciclo_medio: null, delta_h: null });
            }
            topWorst = [...hourlyData].filter(d => d.volume > 0 && d.delta_h !== null).sort((a, b) => (b.delta_h as number) - (a.delta_h as number)).slice(0, 5);
            setCached(cacheKeyPrefix, { hourly: hourlyData, top_worst_hours: topWorst }, 5 * 60 * 1000);
        }

        // Processa Drawer Unificado
        if (hourParam && !drawerData && allResults[1]) {
            const h = parseInt(hourParam);
            const unifiedResult = allResults[1];
            
            if (unifiedResult && unifiedResult.Rows && unifiedResult.Rows.length > 1) {
                const rows = unifiedResult.Rows.slice(1);
                
                const summaryRow = rows.find((r: any) => r.Data[0].VarCharValue === 'SUMMARY');
                const dimRows = rows.filter((r: any) => r.Data[0].VarCharValue.startsWith('DIM_'));
                const vehicleRows = rows.filter((r: any) => r.Data[0].VarCharValue === 'VEHICLE');

                if (summaryRow) {
                    const d = summaryRow.Data;
                    const pf = (idx: number) => parseFloat(d[idx]?.VarCharValue || '0');
                    
                    const ciclo_medio_dia = pf(1);
                    const avg_verde_d = pf(2); const avg_int_d = pf(3); const avg_viag_d = pf(4); const avg_agend_d = pf(5);
                    const avg_verde_h = pf(6); const avg_int_h = pf(7); const avg_viag_h = pf(8); const avg_agend_h = pf(9);
                    const ciclo_medio_hora = pf(10);
                    const volume_hora = parseInt(d[11]?.VarCharValue || '0');

                    if (volume_hora > 0) {
                        const stages = [
                            { name: 'tempo_area_verde_h', avg_hour: parseFloat(avg_verde_h.toFixed(1)), avg_day: parseFloat(avg_verde_d.toFixed(1)), contrib: parseFloat((avg_verde_h - avg_verde_d).toFixed(1)) },
                            { name: 'ciclo_interno_h', avg_hour: parseFloat(avg_int_h.toFixed(1)), avg_day: parseFloat(avg_int_d.toFixed(1)), contrib: parseFloat((avg_int_h - avg_int_d).toFixed(1)) },
                            { name: 'tempo_viagem_h', avg_hour: parseFloat(avg_viag_h.toFixed(1)), avg_day: parseFloat(avg_viag_d.toFixed(1)), contrib: parseFloat((avg_viag_h - avg_viag_d).toFixed(1)) },
                            { name: 'aguardando_agendamento_h', avg_hour: parseFloat(avg_agend_h.toFixed(1)), avg_day: parseFloat(avg_agend_d.toFixed(1)), contrib: parseFloat((avg_agend_h - avg_agend_d).toFixed(1)) }
                        ];

                        const drivers: Record<string, any[]> = { origem: [], produto: [], cliente: [] };
                        let expected_hora_origem = 0;
                        let vol_dia_total = 0;

                        dimRows.forEach((r: any) => {
                            if (r.Data[0].VarCharValue === 'DIM_ORIGEM') vol_dia_total += parseInt(r.Data[3].VarCharValue || '0');
                        });

                        dimRows.forEach((r: any) => {
                            const type = r.Data[0].VarCharValue.replace('DIM_', '').toLowerCase();
                            const name = r.Data[1].VarCharValue || 'Desconhecido';
                            const vol_h = parseInt(r.Data[2].VarCharValue || '0');
                            const vol_d = parseInt(r.Data[3].VarCharValue || '0');
                            const ciclo_d = parseFloat(r.Data[4].VarCharValue || '0');
                            
                            const share_hora_pct = volume_hora > 0 ? (vol_h / volume_hora) : 0;
                            const share_dia_pct = type === 'origem' && vol_dia_total > 0 ? (vol_d / vol_dia_total) : 0;
                            
                            if (type === 'origem') expected_hora_origem += share_hora_pct * ciclo_d;
                            
                            if (vol_h > 0 || vol_d > 0) {
                                drivers[type].push({
                                    nome: name,
                                    share_hora: parseFloat((share_hora_pct * 100).toFixed(1)),
                                    share_dia: parseFloat((share_dia_pct * 100).toFixed(1)),
                                    ciclo_medio_dia: parseFloat(ciclo_d.toFixed(1))
                                });
                            }
                        });

                        Object.values(drivers).forEach(list => list.sort((a, b) => b.share_hora - a.share_hora));

                        const vehicles: VehicleItem[] = vehicleRows.map((r: any) => {
                            const v = r.Data;
                            const vf = (idx: number) => parseFloat(v[idx]?.VarCharValue || '0');
                            return {
                                gmo_id: v[1]?.VarCharValue || '', placa: v[2]?.VarCharValue || '', origem: v[3]?.VarCharValue || '', produto: v[4]?.VarCharValue || '', cliente: v[5]?.VarCharValue || '',
                                ciclo_total_h: parseFloat(vf(6).toFixed(1)), h_verde: parseFloat(vf(7).toFixed(1)), h_interno: parseFloat(vf(8).toFixed(1)), h_viagem: parseFloat(vf(9).toFixed(1)), h_aguardando: parseFloat(vf(10).toFixed(1)),
                                dt_emissao: v[11]?.VarCharValue, dt_agendamento: v[12]?.VarCharValue, dt_janela: v[13]?.VarCharValue, dt_cheguei: v[14]?.VarCharValue, dt_chamada: v[15]?.VarCharValue, dt_chegada: v[16]?.VarCharValue, dt_peso_saida: v[17]?.VarCharValue
                            };
                        });

                        const mix_effect = expected_hora_origem - ciclo_medio_dia;
                        const ops_effect = ciclo_medio_hora - expected_hora_origem;
                        
                        drawerData = {
                            hour: h,
                            summary: { volume: volume_hora, ciclo_medio_hora: parseFloat(ciclo_medio_hora.toFixed(1)), ciclo_medio_dia: parseFloat(ciclo_medio_dia.toFixed(1)), delta_h: parseFloat((ciclo_medio_hora - metaHoras).toFixed(1)) },
                            stages,
                            mix_ops: { mix_effect: parseFloat(mix_effect.toFixed(2)), ops_effect: parseFloat(ops_effect.toFixed(2)), verdict: Math.abs(mix_effect) > Math.abs(ops_effect) ? 'MIX' : 'OPERACAO' },
                            drivers,
                            vehicles
                        };
                        setCached(`${cacheKeyPrefix}_h${h}`, drawerData, 5 * 60 * 1000);
                    }
                }
            }

            if (!drawerData) {
                console.log(`[HourlyDiagnostics] Volume is 0 or no detailed data for hour ${h}, returning empty state.`);
                drawerData = {
                    hour: h,
                    summary: { volume: 0, ciclo_medio_hora: 0, ciclo_medio_dia: 0, delta_h: 0 },
                    stages: [],
                    mix_ops: { mix_effect: 0, ops_effect: 0, verdict: 'N/A' },
                    drivers: { origem: [], produto: [], cliente: [] },
                    vehicles: []
                };
            }
        }

        if (drawerData) {
            console.log(`[HourlyDiagnostics] Drawer Data Ready:`, {
                hasStages: !!drawerData.stages,
                stagesCount: drawerData.stages?.length,
                hasSummary: !!drawerData.summary,
                vehiclesCount: drawerData.vehicles?.length,
                driversCount: Object.keys(drawerData.drivers || {}).length
            });
        }

        return Response.json({
            date: targetDate, terminal, meta_horas: metaHoras,
            hourly: hourlyData, top_worst_hours: topWorst, drawer: drawerData
        });

     } catch (e: any) {
        console.error("!!! [HourlyDiagnostics] FATAL ERROR !!!");
        console.error("Message:", e.message);
        console.error("Stack:", e.stack);
        return Response.json({ 
            error: e.message,
            tip: "Verifique os logs do servidor para detalhes técnicos",
            context: { terminal, targetDate, hourParam }
        }, { status: 500 });
    }
}
