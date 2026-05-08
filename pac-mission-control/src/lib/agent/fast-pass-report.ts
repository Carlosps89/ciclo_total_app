import db from '../db';
import { fetchFastPassData } from '../pac-fast-pass';

export async function getFastPassReport(terminal: string = 'TRO') {
    try {
        // 1. Fetch Plates from SQLite
        const rows = db.prepare("SELECT plate FROM fast_pass_plates WHERE terminal = ? ORDER BY added_at ASC").all(terminal) as { plate: string }[];
        const plates = rows.map(r => r.plate);

        if (plates.length === 0) {
            return `⚡ *RADAR FAST PASS - RUMO*\n\n❌ Nenhuma placa configurada no terminal ${terminal}. Acesse o painel operacional para adicionar caminhões ao radar.`;
        }

        // 2. Fetch Data for Today (D)
        const tzOptions = { timeZone: 'America/Sao_Paulo', year: 'numeric' as const, month: '2-digit' as const, day: '2-digit' as const };
        const todayStr = new Intl.DateTimeFormat('en-CA', tzOptions).format(new Date());
        
        // Fetch Data for Yesterday (D-1)
        const dObj = new Date();
        const d1Obj = new Date(dObj.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = new Intl.DateTimeFormat('en-CA', tzOptions).format(d1Obj);

        // Run both queries in parallel
        const [d_data, d1_data] = await Promise.all([
            fetchFastPassData(terminal, plates, todayStr),
            fetchFastPassData(terminal, plates, yesterdayStr)
        ]);

        if (!d_data) {
            return "❌ Erro ao gerar dados do Fast Pass para Hoje.";
        }

        // Format Helper
        const fmtH = (val: number | null) => val !== null ? val.toFixed(1) + 'h' : '--';

        // 3. Format Message
        let msg = `⚡ *RADAR FAST PASS - RUMO*\n`;
        msg += `📅 Data: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (D)\n\n`;

        msg += `⚔️ *A/B TEST: FAST PASS vs FROTA PADRÃO*\n\n`;

        // D-1
        msg += `⏪ *ONTEM (D-1)*\n`;
        if (d1_data) {
            msg += `*Fast Pass:*\n`;
            msg += `- Viagens Fechadas: ${d1_data.kpis.closed_trips_count}\n`;
            msg += `- Ciclo Médio: ${fmtH(d1_data.kpis.avg_ciclo_dia)}\n`;
            msg += `- Viagens/Veículo: ${d1_data.kpis.avg_trips_per_truck.toFixed(1)}\n`;
            
            msg += `\n*Placa a Placa (Fast Pass):*\n`;
            const activeD1 = d1_data.trucks.filter((t: any) => t.closed_trips_count > 0).sort((a: any, b: any) => b.closed_trips_count - a.closed_trips_count);
            if (activeD1.length > 0) {
                activeD1.forEach((t: any) => {
                    msg += `  • ${t.placa}: ${t.closed_trips_count}v (${fmtH(t.avg_ciclo)})\n`;
                });
            } else {
                msg += `  _Nenhuma viagem fechada_\n`;
            }
            
            msg += `\n*Frota Padrão:*\n`;
            msg += `- Viagens Fechadas: ${d1_data.kpis_padrao.closed_trips_count}\n`;
            msg += `- Ciclo Médio: ${fmtH(d1_data.kpis_padrao.avg_ciclo_dia)}\n`;
            msg += `- Viagens/Veículo: ${d1_data.kpis_padrao.avg_trips_per_truck.toFixed(1)}\n\n`;
        } else {
            msg += `_Sem dados registrados em D-1_\n\n`;
        }

        // D
        msg += `📊 *HOJE (D)*\n`;
        msg += `*Fast Pass:*\n`;
        msg += `- Viagens Fechadas: ${d_data.kpis.closed_trips_count}\n`;
        msg += `- Ciclo Médio: ${fmtH(d_data.kpis.avg_ciclo_dia)}\n`;
        msg += `- Viagens/Veículo: ${d_data.kpis.avg_trips_per_truck.toFixed(1)}\n`;

        msg += `\n*Placa a Placa (Fast Pass):*\n`;
        const activeD = d_data.trucks.filter((t: any) => t.closed_trips_count > 0).sort((a: any, b: any) => b.closed_trips_count - a.closed_trips_count);
        if (activeD.length > 0) {
            activeD.forEach((t: any) => {
                msg += `  • ${t.placa}: ${t.closed_trips_count}v (${fmtH(t.avg_ciclo)})\n`;
            });
        } else {
            msg += `  _Nenhuma viagem fechada_\n`;
        }

        msg += `\n*Frota Padrão:*\n`;
        msg += `- Viagens Fechadas: ${d_data.kpis_padrao.closed_trips_count}\n`;
        msg += `- Ciclo Médio: ${fmtH(d_data.kpis_padrao.avg_ciclo_dia)}\n`;
        msg += `- Viagens/Veículo: ${d_data.kpis_padrao.avg_trips_per_truck.toFixed(1)}\n\n`;

        // Month
        msg += `🏆 *ACUMULADO DO MÊS*\n`;
        msg += `*Fast Pass:* ${fmtH(d_data.kpis_month.avg_ciclo_dia)} (${d_data.kpis_month.avg_trips_per_truck.toFixed(1)} v/d)\n`;
        
        msg += `\n*Placa a Placa (Mês - Fast Pass):*\n`;
        const activeMonth = d_data.trucks_month ? d_data.trucks_month.filter((t: any) => t.closed_trips_count > 0).sort((a: any, b: any) => b.closed_trips_count - a.closed_trips_count) : [];
        if (activeMonth.length > 0) {
            activeMonth.forEach((t: any) => {
                msg += `  • ${t.placa}: ${t.closed_trips_count}v (${fmtH(t.avg_ciclo)})\n`;
            });
        } else {
            msg += `  _Nenhuma viagem fechada no mês_\n`;
        }

        msg += `\n*Padrão:* ${fmtH(d_data.kpis_padrao_month.avg_ciclo_dia)} (${d_data.kpis_padrao_month.avg_trips_per_truck.toFixed(1)} v/d)\n`;

        if (d_data.kpis_month.avg_ciclo_dia > 0 && d_data.kpis_padrao_month.avg_ciclo_dia > 0 && d_data.kpis_month.avg_ciclo_dia < d_data.kpis_padrao_month.avg_ciclo_dia) {
            const perc = Math.round(((d_data.kpis_padrao_month.avg_ciclo_dia - d_data.kpis_month.avg_ciclo_dia) / d_data.kpis_padrao_month.avg_ciclo_dia) * 100);
            msg += `\n🚀 O Fast Pass está sendo *${perc}% mais rápido* neste mês!`;
        }

        return msg;

    } catch (e: any) {
        console.error("Error generating Fast Pass report:", e);
        return `❌ *Erro ao gerar o relatório do Fast Pass:* ${e.message}`;
    }
}
