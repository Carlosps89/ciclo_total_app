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
    const cleanId = placaOrGmo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Busca registro no banco local (últimos 30 dias de histórico)
    // Agora pesquisando tanto em gmo_id quanto na coluna placa para evitar discrepâncias
    const finalRecord = db.prepare(`
        SELECT * FROM gmo_history 
        WHERE (UPPER(replace(replace(gmo_id, '-', ''), ' ', '')) = ?) 
           OR (UPPER(replace(replace(placa, '-', ''), ' ', '')) = ?)
           OR (UPPER(gmo_id) LIKE ?)
           OR (UPPER(placa) LIKE ?)
        ORDER BY dt_inicio DESC LIMIT 1
    `).get(cleanId, cleanId, `%${cleanId}%`, `%${cleanId}%`) as GMORecord | undefined;

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

export async function getPlazaDiagnostic(plazaName: string): Promise<{ text: string, chart?: string }> {
    const isGlobal = ['TRO', 'TOTAL', 'GERAL', 'TUDO'].includes(plazaName.toUpperCase());
    const searchKey = isGlobal ? 'TOTAL' : plazaName.toUpperCase();
    const displayName = isGlobal ? 'RONDONOPOLIS' : plazaName.toUpperCase();
    
    // Helper para buscar stats por período
    const getStats = (timeFilter: string) => {
        return db.prepare(`
            SELECT 
                COUNT(DISTINCT gmo_id) as vol,
                AVG(ciclo_total_h) as avg_cycle,
                (SELECT produto FROM gmo_history gh2 
                 WHERE (UPPER(gh2.origem) = ? OR ? IN ('TRO', 'TOTAL', 'GERAL', 'TUDO'))
                   AND ${timeFilter.replace('dt_peso_saida', 'gh2.dt_peso_saida')}
                 GROUP BY produto ORDER BY COUNT(*) DESC LIMIT 1) as main_product
            FROM gmo_history
            WHERE terminal = 'TRO'
              AND (UPPER(origem) = ? OR ? IN ('TRO', 'TOTAL', 'GERAL', 'TUDO'))
              AND ${timeFilter}
        `).get(searchKey, searchKey, searchKey, searchKey) as { vol: number, avg_cycle: number, main_product: string };
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
          AND (UPPER(origem) = ? OR ? IN ('TRO', 'TOTAL', 'GERAL', 'TUDO'))
          AND dt_peso_saida >= date('now', '-24 hours')
        GROUP BY 1, 2
        HAVING vol >= 3
        ORDER BY avg_cycle DESC
        LIMIT 3
    `).all(searchKey, searchKey) as { cliente: string, produto: string, avg_cycle: number, vol: number }[];

    const meta = isGlobal ? 46.5 : getTargetFor('TRO', plazaName);
    
    const iconD1 = (statsD1.avg_cycle || 0) > meta ? '🔴' : '🟢';
    const iconD = (statsD.avg_cycle || 0) > meta ? '🔴' : '🟢';

    const text = [
        `📊 *DIAGNÓSTICO DE PRAÇA: ${displayName}*`,
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

export async function getFraudAudit(placa: string, dataSuspeitaISO: string, indicio: string, rawPayload?: any): Promise<string | null> {
    const cleanId = placa.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    
    // 1. Busca registro
    const record = db.prepare(`
        SELECT * FROM gmo_history 
        WHERE (UPPER(replace(replace(placa, '-', ''), ' ', '')) = ?) 
           OR (UPPER(replace(replace(gmo_id, '-', ''), ' ', '')) = ?)
           OR (UPPER(placa) LIKE ?)
           OR (UPPER(gmo_id) LIKE ?)
        ORDER BY dt_inicio DESC LIMIT 1
    `).get(cleanId, cleanId, `%${cleanId}%`, `%${cleanId}%`) as GMORecord | undefined;

    if (!record) return null;

    const tsEmissao = new Date(record.dt_inicio).getTime();
    const tsSaidaRaw = record.dt_peso_saida ? new Date(record.dt_peso_saida).getTime() : null;
    const tsFimParaCiclo = tsSaidaRaw || Date.now();
    const isEmAberto = !tsSaidaRaw;

    // Helper para extrair valores limpos do SharePoint
    const cleanSP = (val: any) => {
        if (!val) return '---';
        if (typeof val === 'object') return val.Value || val.value || JSON.stringify(val);
        if (typeof val === 'string' && val.startsWith('{')) {
            try {
                const obj = JSON.parse(val);
                return obj.Value || obj.value || val;
            } catch (e) { return val; }
        }
        return val;
    };

    // Extração de campos solicitados do payload do SharePoint
    const motivoRecusa = rawPayload 
        ? cleanSP(
            rawPayload.motivo_recusa || 
            rawPayload['Motivo de recusa'] || 
            rawPayload.Motivo_x0020_de_x0020_recusa || 
            rawPayload.Motivoderecusa || 
            rawPayload.motivo || 
            indicio
          ) 
        : cleanSP(indicio);

    const dataCriacao = rawPayload ? (rawPayload.Criado || rawPayload.Created || rawPayload.created || dataSuspeitaISO) : dataSuspeitaISO;

    const h = (ms: number | null) => ms ? (ms / (1000 * 60 * 60)).toFixed(1) + 'h' : '---';
    
    const metricas = {
        total: h(tsFimParaCiclo - tsEmissao),
        aguardando: record.dt_agendamento ? h(new Date(record.dt_agendamento).getTime() - tsEmissao) : '---',
        viagem: (record.dt_agendamento && record.dt_cheguei) ? h(new Date(record.dt_cheguei).getTime() - new Date(record.dt_agendamento).getTime()) : '---',
        areaVerde: (record.dt_cheguei && record.dt_chamada) ? h(new Date(record.dt_chamada).getTime() - new Date(record.dt_cheguei).getTime()) : '---',
        interno: (record.dt_chegada && tsSaidaRaw) ? h(tsSaidaRaw - new Date(record.dt_chegada).getTime()) : '---'
    };

    const displayPlaca = record.placa || (record.gmo_id.includes('_') ? record.gmo_id.split('_').pop() : record.gmo_id);

    // 5. Construção do Report (Template ajustado CCO)
    return [
        `🕵️ DESCARGA ASSISTIDA`,
        `----------------------------------`,
        `📋 *DADOS DA CARGA:*`,
        `• Placa: ${displayPlaca}`,
        `• GMO: ${record.gmo_id}`,
        `• Cliente: ${record.cliente || '---'}`,
        `• Origem: ${record.origem || '---'}`,
        `• Produto: ${record.produto || '---'}`,
        ``,
        `🚀 *LINHA DO TEMPO:*`,
        `• Data Emissão: ${formatDT(record.dt_inicio)}`,
        `• Data Agendamento: ${formatDT(record.dt_agendamento)}`,
        `• Janela: ${formatDT(record.janela_agendamento)}`,
        `• Cheguei: ${formatDT(record.dt_cheguei)}`,
        `• Chegada (Check-in): ${formatDT(record.dt_chegada)}`,
        `• Peso de Saída: ${formatDT(record.dt_peso_saida)}${isEmAberto ? ' (Não Realizado)' : ''}`,
        ``,
        `⏱️ *MÉTRICAS DE TEMPO:*`,
        `• Ciclo Total: ${metricas.total}${isEmAberto ? ' (Projetado)' : ''}`,
        `• Aguardando Agend.: ${metricas.aguardando}`,
        `• Tempo de Viagem: ${metricas.viagem}`,
        `• Tempo de Área Verde: ${metricas.areaVerde}`,
        `• Ciclo Interno: ${metricas.interno}`,
        ``,
        `🚩 *DADOS DO INDÍCIO (SharePoint):*`,
        `• Motivo: ${motivoRecusa}`,
        `• Data de Criação: ${formatDT(dataCriacao)}`,
        ``,
        `Acompanhamento Operacional CCO Rumo`
    ].join('\n');
}
