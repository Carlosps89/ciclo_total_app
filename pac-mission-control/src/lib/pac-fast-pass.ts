import { runQuery, getSchemaMap } from '@/lib/athena';
import { COMMON_CTES } from '@/lib/athena-sql';

export const STANDARD_FLEET_PLATES = [
    "HTP5202", "ARX3121", "MPB6J22", "HTP5200", "BEV1520",
    "ARZ0D69", "BAN7860", "DVT8H92", "JZN6D65", "MFR5C02", "OBD5652", "JYY2552",
    "BAN8F60", "BAN8G60", "OAS9D47", "ASA3G03", "MGI0827", "BAN8360", "BAN9760",
    "NJW4117", "KAB8503", "KIT4B61", "ONK1E50", "OAZ3826", "OBF0641", "NJV6984",
    "JZQ1F32", "EZU3H56", "JZE7557", "NIZ1242", "ASW9I55", "JYU3G33", "BAN8060",
    "NGN9H16", "DVS5I83", "INT1G01", "NTX2076", "BAN7960", "OBQ6560", "OBE9321",
    "DTC3B41", "QCM0585", "OBS6660", "HRM4F56", "NFF6B67", "OAX2165", "ABK3D34",
    "MBI7B53", "NPC0162", "DTD9031", "KAH4872", "KAD3549", "HBN8H88", "HTP5203",
    "NJG5443", "BAN9560", "ASR2D33", "AMV4D70", "BAN8260", "AKQ7E60", "BAN8160",
    "MHI7F00", "NUE8D65"
];

export async function fetchFastPassData(terminal: string, plates: string[], targetDateStr: string) {
    if (plates.length === 0) return null;

    const platesList = plates.map(p => `'${p}'`).join(',');
    const standardPlatesList = STANDARD_FLEET_PLATES.map(p => `'${p}'`).join(',');

    const tzOptions = { timeZone: 'America/Sao_Paulo', year: 'numeric' as const, month: '2-digit' as const, day: '2-digit' as const };
    const targetDateObj = new Date(targetDateStr + 'T12:00:00Z');
    
    // We need data for the last 7 days AND for the current month
    const sevenDaysAgoObj = new Date(targetDateObj.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonthObj = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), 1);
    const startOfRangeObj = new Date(Math.min(sevenDaysAgoObj.getTime(), startOfMonthObj.getTime()));
    
    const startOfRangeStr = new Intl.DateTimeFormat('en-CA', tzOptions).format(startOfRangeObj);
    const todayStr = new Intl.DateTimeFormat('en-CA', tzOptions).format(new Date());

    const map = await getSchemaMap();

    const query = `
        ${COMMON_CTES(map, terminal, '', { start: startOfRangeStr, end: targetDateStr })}
        , fast_pass_trips AS (
            SELECT 
                c.*,
                case when peso_saida is not null then 1 else 0 end as is_closed,
                case when placa_tracao IN (${platesList}) then 'FAST_PASS' else 'PADRAO' end as fleet_type,
                row_number() OVER (PARTITION BY placa_tracao ORDER BY ts_ult DESC) as rn_latest_overall
            FROM calc c
            WHERE placa_tracao IN (${platesList}) OR placa_tracao IN (${standardPlatesList})
        )
        SELECT 
            gmo_id,
            placa_tracao,
            is_closed,
            rn_latest_overall,
            situacao_descricao,
            evento_descricao,
            ciclo_total_h,
            aguardando_agendamento_h,
            viagem_original as tempo_viagem_h,
            interno_original as tempo_interno_h,
            try_cast(ts_ult as varchar) as ts_ult,
            try_cast(dt_chegada as varchar) as chegada,
            try_cast(peso_saida as varchar) as peso_saida,
            try_cast(dt_agendamento as varchar) as dt_agendamento,
            try_cast(dt_emissao as varchar) as dt_emissao,
            fleet_type
        FROM fast_pass_trips
    `;

    const result = await runQuery(query);
    const rows = result.Rows ? result.Rows.slice(1) : [];

    const cap = (val: string | undefined | null) => {
        if (!val) return null;
        const num = parseFloat(val);
        if (isNaN(num) || num < -24 || num > 1000) return null;
        return num;
    };

    const allTrips = rows.map(row => {
        const data = row.Data || [];
        const is_closed = parseInt(data[2]?.VarCharValue || '0');
        const ciclo_h = data[6]?.VarCharValue ? parseFloat(data[6].VarCharValue) : null;
        const finalCiclo = is_closed === 1 ? (ciclo_h || 0) : null;
        
        return {
            gmo_id: data[0]?.VarCharValue,
            placa: data[1]?.VarCharValue,
            is_closed,
            rn_latest: parseInt(data[3]?.VarCharValue || '1'),
            situacao: data[4]?.VarCharValue,
            evento: data[5]?.VarCharValue,
            ciclo_h: finalCiclo !== null ? cap(finalCiclo.toString()) : null,
            aguardando_h: cap(data[7]?.VarCharValue),
            viagem_h: cap(data[8]?.VarCharValue),
            interno_h: cap(data[9]?.VarCharValue),
            ts_ult: data[10]?.VarCharValue,
            chegada: data[11]?.VarCharValue,
            peso_saida: data[12]?.VarCharValue,
            dt_agendamento: data[13]?.VarCharValue,
            dt_emissao: data[14]?.VarCharValue,
            fleet_type: data[15]?.VarCharValue || 'PADRAO'
        };
    });

    const isTargetToday = targetDateStr === todayStr;
    const closedTripsTargetDate = allTrips.filter(t => t.is_closed === 1 && t.peso_saida && t.peso_saida.startsWith(targetDateStr));
    
    const calcKpis = (trips: any[], daysDivider: number = 1) => {
        const count = trips.length;
        const avgCiclo = count > 0 ? trips.reduce((acc, t) => acc + (t.ciclo_h || 0), 0) / count : 0;
        const activePlates = new Set(trips.map(t => t.placa)).size;
        const avgTripsPerTruck = activePlates > 0 ? (count / activePlates) / daysDivider : 0;
        return { closed_trips_count: count, avg_ciclo_dia: avgCiclo, avg_trips_per_truck: avgTripsPerTruck };
    };

    // Dia Acumulado KPIs
    const fastPassClosedTarget = closedTripsTargetDate.filter(t => t.fleet_type === 'FAST_PASS');
    const standardClosedTarget = closedTripsTargetDate.filter(t => t.fleet_type === 'PADRAO');
    const kpis = calcKpis(fastPassClosedTarget, 1);
    const kpis_padrao = calcKpis(standardClosedTarget, 1);

    // Mês Acumulado KPIs
    const currentMonthPrefix = targetDateStr.substring(0, 7); // 'YYYY-MM'
    const closedTripsMonth = allTrips.filter(t => t.is_closed === 1 && t.peso_saida && t.peso_saida.startsWith(currentMonthPrefix));
    
    const FAST_PASS_START_DATE = '2026-05-05';
    
    const fpMonthTrips = closedTripsMonth.filter(t => t.fleet_type === 'FAST_PASS' && t.peso_saida && t.peso_saida >= FAST_PASS_START_DATE);
    const stdMonthTrips = closedTripsMonth.filter(t => t.fleet_type === 'PADRAO');
    
    const targetDayNum = targetDateObj.getDate();
    let fpMonthDays = targetDayNum;
    if (currentMonthPrefix === '2026-05') {
        fpMonthDays = Math.max(1, targetDayNum - 4);
    }
    
    const kpis_month = calcKpis(fpMonthTrips, fpMonthDays);
    const kpis_padrao_month = calcKpis(stdMonthTrips, targetDayNum);
    
    const trucks_month = plates.map(placa => {
        const tr = fpMonthTrips.filter(t => t.placa === placa);
        const count = tr.length;
        const avg = count > 0 ? tr.reduce((acc, t) => acc + (t.ciclo_h || 0), 0) / count : null;
        return { placa, closed_trips_count: count, avg_ciclo: avg };
    });

    // Filter UI individual trucks to only show Fast Pass plates, not the 69 standard ones
    const fastPassTripsAll = allTrips.filter(t => t.fleet_type === 'FAST_PASS');
    const trucks = plates.map(placa => {
        let latestTrip = null;
        if (isTargetToday) {
            latestTrip = fastPassTripsAll.find(t => t.placa === placa && t.rn_latest === 1) || null;
        } else {
            const pastTrips = fastPassClosedTarget.filter(t => t.placa === placa).sort((a, b) => (b.ts_ult || '').localeCompare(a.ts_ult || ''));
            latestTrip = pastTrips.length > 0 ? pastTrips[0] : null;
        }

        const truckClosedTripsTarget = fastPassClosedTarget.filter(t => t.placa === placa);
        const truckAvgCiclo = truckClosedTripsTarget.length > 0 
            ? truckClosedTripsTarget.reduce((acc, t) => acc + (t.ciclo_h || 0), 0) / truckClosedTripsTarget.length 
            : null;

        const tripsBreakdown = fastPassTripsAll.filter(t => t.placa === placa && (
            (t.is_closed === 1 && t.peso_saida && t.peso_saida.startsWith(targetDateStr)) ||
            (isTargetToday && t.is_closed === 0 && t.rn_latest === 1)
        ));

        return {
            placa,
            latest_trip: latestTrip,
            closed_trips_count: truckClosedTripsTarget.length,
            avg_ciclo: truckAvgCiclo,
            trips: tripsBreakdown
        };
    });

    const chart_data = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(targetDateObj.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = new Intl.DateTimeFormat('en-CA', tzOptions).format(d);
        
        const closedTripsThatDay = allTrips.filter(t => t.is_closed === 1 && t.peso_saida && t.peso_saida.startsWith(dateStr));
        const fpTripsDay = closedTripsThatDay.filter(t => t.fleet_type === 'FAST_PASS');
        const stdTripsDay = closedTripsThatDay.filter(t => t.fleet_type === 'PADRAO');

        const avg_fp = fpTripsDay.length > 0 ? fpTripsDay.reduce((acc, t) => acc + (t.ciclo_h || 0), 0) / fpTripsDay.length : 0;
        const avg_std = stdTripsDay.length > 0 ? stdTripsDay.reduce((acc, t) => acc + (t.ciclo_h || 0), 0) / stdTripsDay.length : 0;

        const trucksThatDay = plates.map(placa => {
            const tr = fpTripsDay.filter(t => t.placa === placa);
            const count = tr.length;
            const avg = count > 0 ? tr.reduce((acc, t) => acc + (t.ciclo_h || 0), 0) / count : null;
            return { placa, count, avg_ciclo: avg, trips: tr };
        });

        const dayNum = d.getDate();
        const monthNum = d.getMonth() + 1;
        const label = `${String(dayNum).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}`;

        chart_data.push({
            date: dateStr,
            label,
            avg_ciclo: avg_fp, // For backwards compatibility UI
            avg_ciclo_fp: avg_fp,
            avg_ciclo_std: avg_std,
            total_trips: fpTripsDay.length,
            trucks: trucksThatDay.filter(t => t.count > 0)
        });
    }

    return {
        terminal,
        target_date: targetDateStr,
        updated_at: new Date().toISOString(),
        kpis,
        kpis_padrao,
        kpis_month,
        kpis_padrao_month,
        trucks,
        trucks_month,
        chart_data
    };
}
