import db from '../db';
import { GMORecord, getTargetFor } from '../db';
import { captureDashboardScreenshot } from './screenshot';

/**
 * Formata data/hora para o padrão DD/MM HH:MM
 */
function formatDT(dt?: string | null): string {
    if (!dt) return '---';
    try {
        const date = new Date(dt);
        return date.toLocaleString('pt-BR', { 
            day: '2-digit', 
            month: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
        }).replace(',', '');
    } catch (e) {
        return '---';
    }
}

/**
 * Calcula diferença em horas entre duas datas
 */
function diffHours(start?: string | null, end?: string | null): string {
    if (!start || !end) return '---';
    try {
        const s = new Date(start).getTime();
        const e = new Date(end).getTime();
        const diff = (e - s) / (1000 * 60 * 60);
        return diff >= 0 ? diff.toFixed(1) + 'h' : '---';
    } catch (e) {
        return '---';
    }
}

export async function getVehicleVerification(placaOrGmo: string): Promise<string | null> {
    const cleanId = placaOrGmo.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    
    // Busca registro no banco local (últimos 30 dias de histórico)
    const record = db.prepare(`
        SELECT * FROM gmo_history 
        WHERE (UPPER(replace(replace(gmo_id, '-', ''), ' ', '')) = ?) 
           OR (UPPER(replace(replace(gmo_id, '-', ''), ' ', '')) LIKE ?)
           OR (UPPER(replace(replace(gmo_id, '-', ''), ' ', '')) = ?)
        ORDER BY dt_inicio DESC LIMIT 1
    `).get(cleanId, `%${cleanId}%`, cleanId.replace('-', '')) as GMORecord | undefined;

    // Se não achar por GMO_ID, tenta por placa
    let finalRecord = record;
    if (!finalRecord) {
        finalRecord = db.prepare(`
            SELECT * FROM gmo_history 
            WHERE UPPER(replace(gmo_id, '-', '')) LIKE ? 
            ORDER BY dt_inicio DESC LIMIT 1
        `).get(`%${cleanId}%`) as GMORecord | undefined;
    }

    if (!finalRecord) return null;

    // Buscar Meta da Praça usando o helper oficial do sistema
    const metaPraca = getTargetFor(finalRecord.terminal, finalRecord.origem);

    // Cálculos de Ciclo
    const isFinished = !!finalRecord.dt_peso_saida;
    const now = new Date().toISOString();
    const endForTotal = isFinished ? finalRecord.dt_peso_saida! : now;
    
    const cycleTotal = (new Date(endForTotal).getTime() - new Date(finalRecord.dt_inicio).getTime()) / (1000 * 60 * 60);
    const isAboveTarget = cycleTotal > metaPraca;
    const statusIcon = isAboveTarget ? '🔴' : '🟢';

    // Construção da Mensagem
    const msg = [
        `🔍 *VERIFICAÇÃO DE VEÍCULO*`,
        `📋 *DADOS DA CARGA:*`,
        `GMO: ${finalRecord.gmo_id} | Placa: ${finalRecord.gmo_id.split('_').pop() || '---'}`,
        `Origem: ${finalRecord.origem} | Cliente: ${finalRecord.cliente}`,
        ``,
        `🚀 *LINHA DO TEMPO:*`,
        `Emissão: ${formatDT(finalRecord.dt_inicio)}`,
        `Agendamento: ${formatDT(finalRecord.dt_agendamento)}`,
        `Janela Agendada: ${formatDT(finalRecord.janela_agendamento)}`,
        `Cheguei: ${formatDT(finalRecord.dt_cheguei)}`,
        `Chamada: ${formatDT(finalRecord.dt_chamada)}`,
        `Terminal: ${formatDT(finalRecord.dt_chegada)}`,
        `Peso Saída: ${formatDT(finalRecord.dt_peso_saida)}`,
        ``,
        `⏱️ *MÉTRICAS:*`,
        `Agd Agend.: ${diffHours(finalRecord.dt_inicio, finalRecord.dt_agendamento)}`,
        `Viagem: ${diffHours(finalRecord.dt_agendamento, finalRecord.dt_cheguei)}`,
        `Área Verde: ${diffHours(finalRecord.dt_cheguei, finalRecord.dt_chamada)}`,
        `Terminal/Interno: ${diffHours(finalRecord.dt_chegada, finalRecord.dt_peso_saida)}`,
        ``,
        `🏁 *DESEMPENHO:*`,
        `Meta da Praça (${finalRecord.origem}): ${metaPraca.toFixed(1)}h`,
        `${isFinished ? 'Ciclo Total' : 'Ciclo Até o Momento'}: ${cycleTotal.toFixed(1)}h ${statusIcon}`,
        ``,
        `_CCO Rodoviário RUMO_`
    ].join('\n');

    return msg;
}

export async function getPlazaDiagnostic(plazaName: string): Promise<{ text: string, chart?: Buffer }> {
    const isGlobal = plazaName.toUpperCase() === 'TRO' || plazaName.toUpperCase() === 'TOTAL';
    const filterName = isGlobal ? 'RONDONOPOLIS' : plazaName.toUpperCase();
    
    // Helper para buscar stats por período
    const getStats = (timeFilter: string) => {
        return db.prepare(`
            SELECT 
                COUNT(DISTINCT gmo_id) as vol,
                AVG(ciclo_total_h) as avg_cycle,
                (SELECT produto FROM gmo_history gh2 
                 WHERE (UPPER(gh2.origem) = ? OR ? IN ('RONDONOPOLIS', 'TRO', 'TOTAL'))
                   AND ${timeFilter.replace('dt_peso_saida', 'gh2.dt_peso_saida')}
                 GROUP BY produto ORDER BY COUNT(*) DESC LIMIT 1) as main_product
            FROM gmo_history
            WHERE terminal = 'TRO'
              AND (UPPER(origem) = ? OR ? IN ('RONDONOPOLIS', 'TRO', 'TOTAL'))
              AND ${timeFilter}
        `).get(filterName, filterName, filterName, filterName) as { vol: number, avg_cycle: number, main_product: string };
    };

    // Cenários D-1 e D
    const statsD1 = getStats("dt_peso_saida >= date('now', '-1 day') AND dt_peso_saida < date('now')");
    const statsD = getStats("dt_peso_saida >= date('now')");

    // Busca ofensores (Ult. 24h para contexto de risco)
    const offenders = db.prepare(`
        SELECT 
            cliente_norm as cliente,
            produto,
            AVG(ciclo_total_h) as avg_cycle,
            COUNT(gmo_id) as vol
        FROM gmo_history
        WHERE terminal = 'TRO'
          AND (UPPER(origem) = ? OR ? IN ('RONDONOPOLIS', 'TRO', 'TOTAL'))
          AND dt_peso_saida >= date('now', '-24 hours')
        GROUP BY 1, 2
        HAVING vol >= 3
        ORDER BY avg_cycle DESC
        LIMIT 3
    `).all(filterName, filterName) as { cliente: string, produto: string, avg_cycle: number, vol: number }[];

    const meta = isGlobal ? 46.5 : getTargetFor('TRO', plazaName);
    
    const iconD1 = (statsD1.avg_cycle || 0) > meta ? '🔴' : '🟢';
    const iconD = (statsD.avg_cycle || 0) > meta ? '🔴' : '🟢';

    const text = [
        `📊 *DIAGNÓSTICO DE PRAÇA: ${filterName}*`,
        `----------------------------------`,
        `📆 *Cenário D-1 (Ontem):*`,
        `• Vol. Descargas: ${statsD1.vol || 0} cms | [${statsD1.main_product || '---'}]`,
        `• Ciclo Médio: ${statsD1.avg_cycle?.toFixed(1) || 0}h ${iconD1} | Meta: ${meta.toFixed(1)}h`,
        ``,
        `🚀 *Cenário D (Hoje/Real-time):*`,
        `• Vol. Descargas: ${statsD.vol || 0} cms | [${statsD.main_product || '---'}]`,
        `• Ciclo Médio: ${statsD.avg_cycle?.toFixed(1) || 0}h ${iconD} | Meta: ${meta.toFixed(1)}h`,
        ``,
        offenders.length > 0 ? `⚠️ *Principais Ofensores (Ciclo Alta):*` : `✅ *Sem ofensores críticos identificados.*`,
        ...offenders.map(o => `• ${o.cliente}: ${o.avg_cycle.toFixed(1)}h (${o.vol} cms) [${o.produto}]`),
        ``,
        `🖼️ _Gerando gráfico de ciclo..._`,
        `_CCO Rodoviário RUMO_`
    ].join('\n');

    // Captura gráfico MTD
    try {
        const path = `/analise/plaza-trend?terminal=TRO${isGlobal ? '' : `&origem=${encodeURIComponent(plazaName)}`}`;
        const chart = await captureDashboardScreenshot(path);
        return { text, chart };
    } catch (e) {
        console.error("[Analyst] Erro ao capturar tendência:", e);
        return { text: text + '\n\n⚠️ _Erro ao gerar gráfico de tendência._' };
    }
}
