import dotenv from 'dotenv';
import path from 'path';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { getHistoryStats } from '../lib/db';
import db from '../lib/db';
import { formatWhatsAppSummary } from '../lib/agent/whatsapp-ai';
import { syncFinishedGMOs } from '../lib/sync-gmo';
import { captureDashboardScreenshot } from '../lib/agent/screenshot';
import { getVehicleVerification, getPlazaDiagnostic } from '../lib/agent/pac-analyst';
import { MessageMedia } from 'whatsapp-web.js';

console.log("=========================================");
console.log("🤖 INICIANDO BOT DO WHATSAPP - PAC IA");
console.log("=========================================");

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.resolve(process.cwd(), '.wwebjs_auth') }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let myNumberId: string | null = null;

client.on('qr', (qr: string) => {
    console.log('\n[WhatsApp] 📱 Qrcode gerado! Escaneie via WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('[WhatsApp] ✅ Cliente Conectado e Pronto!');
    myNumberId = client.info.wid._serialized;
    console.log(`[WhatsApp] 📞 ID: ${myNumberId}`);

    // Mandar msg de boas vindas
    await client.sendMessage(myNumberId, "🤖 *PAC Bot Online:* Conexão estabelecida com sucesso! O Relatório diário de D-1 está agendado para 06:00 BRT.");
    
    startCronJobs();
});

// Responde a comandos basais
client.on('message_create', async (msg) => {
    // Loga mensagens recebidas (apenas comandos pra não flodar)
    if (msg.body.startsWith('/')) {
        console.log(`[WhatsApp] Comando lido: "${msg.body}" (De: ${msg.from} Para: ${msg.to})`);
    }

    const body = msg.body.trim().toLowerCase();
    
    // Identificação Robusta do Remetente
    let sender = '';
    let pushname = 'Usuário';
    try {
        const contact = await msg.getContact();
        sender = contact.number;
        pushname = contact.pushname || 'Usuário';
    } catch (e: any) {
        // Fallback: extrai número do ID (ex: 5563... @c.us ou @lid)
        const rawId = msg.author || msg.from || '';
        sender = rawId.split('@')[0];
        
        // Fallback: se for mensagem própria, usa o número do bot se disponível
        if (msg.fromMe && client.info?.wid) {
            sender = client.info.wid.user;
            pushname = 'Admin (Eu)';
        }

        // Silencia erros específicos do WWebJS que poluem o console
        const errorMessage = e.message || String(e);
        const shouldSilence = 
            errorMessage.includes("id property") || 
            errorMessage.includes("_serialized") ||
            errorMessage.includes("undefined (reading 'wid')");

        if (!shouldSilence) {
            console.error("[WhatsApp] Erro ao buscar contato:", errorMessage);
        }
    }

    // Helper: Check if sender is admin (either from DB or .env)
    const isAdmin = (phoneNumber: string) => {
        // Se a mensagem foi enviada por mim mesmo (bot)
        if (msg.fromMe) return true;

        const cleanSender = phoneNumber.replace(/\D/g, '');
        const adminEnv = (process.env.ADMIN_PHONE_NUMBER || '').split('@')[0].replace(/\D/g, '');
        
        console.log(`[WhatsApp/AdminCheck] Sender: "${cleanSender}" vs AdminEnv: "${adminEnv}"`);
        
        if (cleanSender === adminEnv && cleanSender !== '') return true;
        
        try {
            const row = db.prepare("SELECT is_admin FROM whatsapp_contacts WHERE phone_number = ? AND is_active = 1").get(cleanSender) as { is_admin: number } | undefined;
            const dbAdmin = !!row?.is_admin;
            console.log(`[WhatsApp/AdminCheck] DB Result for ${cleanSender}: ${dbAdmin}`);
            return dbAdmin;
        } catch (e) {
            console.error(`[WhatsApp/AdminCheck] DB Error:`, e);
            return false;
        }
    };

    if (body === '/resumo' || body === '/status') {
        const target = msg.fromMe ? msg.to : msg.from;
        console.log(`[WhatsApp] Gatilho ${body} ativado para ${target}`);
        
        await client.sendMessage(target, "CCO Rumo: Buscando dados mais recentes... Isso pode levar alguns segundos.");
        await sendDailyReport(target, true); // forceSync = true
    }

    if (body === '/painel' || body === '/print') {
        const target = msg.fromMe ? msg.to : msg.from;
        await client.sendMessage(target, "📸 *CCO Rumo:* Gerando captura do painel em alta definição... Por favor, aguarde alguns segundos.");
        
        try {
            const buffer = await captureDashboardScreenshot();
            const media = new MessageMedia('image/jpeg', buffer.toString('base64'), 'painel_operacional.jpg');
            await client.sendMessage(target, media, { caption: "📊 *Painel de Operações - Tempo Real*" });
        } catch (e) {
            console.error("[WhatsApp] Erro ao gerar print:", e);
            await client.sendMessage(target, "❌ *Erro:* Não foi possível gerar a captura do painel neste momento.");
        }
    }

    if (body.startsWith('/analise') || body.startsWith('/placa')) {
        const target = msg.fromMe ? msg.to : msg.from;
        const arg = body.split(' ').slice(1).join(' ').trim();
        
        if (!arg) {
            await client.sendMessage(target, "💡 *Dica:* Informe a placa ou código da carga para verificar. Ex: `/analise ABC1234`.");
            return;
        }

        console.log(`[WhatsApp] Iniciando Analise para: ${arg}`);
        
        // Detector de Tipo: Placa (7 chars) vs Praça
        const isPlaca = arg.length >= 7 && /\d/.test(arg); // Simples heurística: +7 chars e tem número

        if (isPlaca) {
            const report = await getVehicleVerification(arg);
            if (report) {
                await client.sendMessage(target, report);
            } else {
                // Tenta uma busca mais agressiva
                const retryReport = await getVehicleVerification(arg.replace(/[^A-Z0-9]/g, ''));
                if (retryReport) {
                    await client.sendMessage(target, retryReport);
                } else {
                    await client.sendMessage(target, `❌ *Não encontrado:* Não localizei dados para o veículo "${arg}".`);
                }
            }
        } else {
            // Analise de Praça
            const diag = await getPlazaDiagnostic(arg);
            await client.sendMessage(target, diag.text);
            
            if (diag.chart) {
                const media = new MessageMedia('image/jpeg', diag.chart.toString('base64'), `tendencia_${arg}.jpg`);
                await client.sendMessage(target, media);
            }
        }
    }

    if (body === '/inscrever') {
        try {
            db.prepare("INSERT OR REPLACE INTO whatsapp_contacts (phone_number, name, is_active) VALUES (?, ?, 1)").run(sender, pushname);
            await msg.reply("✅ *Sucesso!* Você foi inscrito para receber o resumo diário às 06:00.");
        } catch (e) {
            await msg.reply("❌ Erro ao processar inscrição.");
        }
    }

    if (body === '/cancelar') {
        db.prepare("UPDATE whatsapp_contacts SET is_active = 0 WHERE phone_number = ?").run(sender);
        await msg.reply("⏹️ *Inscrição Cancelada:* Você não receberá mais os resumos automáticos.");
    }

    if (body.startsWith('/adicionar')) {
        if (!isAdmin(sender)) return msg.reply("🚫 Apenas administradores podem usar este comando.");
        const parts = msg.body.split(' ');
        if (parts.length < 2) return msg.reply("💡 Use: `/adicionar [número] [nome]`");
        const newNum = parts[1].replace(/\D/g, '');
        const name = parts.slice(2).join(' ').replace(/[\[\]]/g, '').trim() || 'Convidado';
        try {
            db.prepare("INSERT OR REPLACE INTO whatsapp_contacts (phone_number, name, is_active) VALUES (?, ?, 1)").run(newNum, name);
            await msg.reply(`✅ *${name}* (${newNum}) adicionado à lista.`);
        } catch (e) {
            await msg.reply("❌ Erro ao adicionar contato.");
        }
    }

    if (body.startsWith('/remover')) {
        if (!isAdmin(sender)) return msg.reply("🚫 Apenas administradores podem usar este comando.");
        const parts = msg.body.split(' ');
        if (parts.length < 2) return msg.reply("💡 Use: `/remover [número]`");
        const remNum = parts[1].replace(/\D/g, '');
        db.prepare("UPDATE whatsapp_contacts SET is_active = 0 WHERE phone_number = ?").run(remNum);
        await msg.reply(`🗑️ Contato ${remNum} removido da lista.`);
    }

    if (body === '/lista') {
        if (!isAdmin(sender)) return msg.reply("🚫 Apenas administradores podem usar este comando.");
        const contacts = db.prepare("SELECT phone_number, name FROM whatsapp_contacts WHERE is_active = 1").all() as { phone_number: string, name: string }[];
        if (contacts.length === 0) return msg.reply("Lista vazia.");
        let txt = "📋 *Lista de Contatos Ativos:*\n";
        contacts.forEach(c => txt += `- ${c.name} (${c.phone_number})\n`);
        await msg.reply(txt);
    }

    if (body === '/disparar') {
        if (!isAdmin(sender)) return msg.reply("🚫 Apenas administradores podem usar este comando.");
        await msg.reply("🚀 *PAC Insight:* Iniciando disparo em massa para todos os contatos ativos...");
        try {
            await sendBulkReports();
            await msg.reply("✅ Disparo em massa concluído com sucesso.");
        } catch (e) {
            console.error("[WhatsApp] Erro no disparo em massa:", e);
            await msg.reply("❌ Erro durante o disparo em massa.");
        }
    }

    if (body === '/gestao_metas') {
        if (!isAdmin(sender)) return msg.reply("🚫 Apenas administradores podem usar este comando.");
        const stats = db.prepare("SELECT COUNT(*) as total FROM plaza_targets").get() as { total: number };
        const top = db.prepare("SELECT origem, meta_h FROM plaza_targets LIMIT 10").all() as { origem: string, meta_h: number }[];
        
        let txt = `📊 *Gestão de Metas Operacionais*\n\n`;
        txt += `Total de municípios castrados: *${stats.total}*\n\n`;
        txt += `*Exemplos:* \n`;
        top.forEach(t => txt += `- ${t.origem}: ${t.meta_h}h\n`);
        txt += `\nPara alterar use: \n*/setmeta [PRAÇA] [VALOR]*\nEx: /setmeta JANGADA 24.5`;
        await msg.reply(txt);
    }

    if (body.startsWith('/setmeta')) {
        if (!isAdmin(sender)) return msg.reply("🚫 Apenas administradores podem usar este comando.");
        const parts = body.split(' ');
        if (parts.length < 3) return msg.reply("❌ Formato inválido. Use: /setmeta [PRAÇA] [VALOR]");
        
        const praca = parts[1].toUpperCase();
        const valor = parseFloat(parts[2]);

        if (isNaN(valor)) return msg.reply("❌ Valor de meta inválido.");

        try {
            db.prepare("INSERT OR REPLACE INTO plaza_targets (terminal, origem, meta_h) VALUES ('TRO', ?, ?)")
              .run(praca, valor);
            await msg.reply(`✅ Meta da praça *${praca}* atualizada para *${valor}h*.`);
        } catch (e) {
            await msg.reply("❌ Erro ao atualizar meta no banco de dados.");
        }
    }
});

// Funções de Helper de Data em BRT
function getDaysParamsBRT() {
    const now = new Date();
    
    // Subtrai 3 horas do UTC para pegar horário oficial BRT aproximado pro Node
    const brtTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
    
    const getBRTMidnight = (daysAgo: number) => {
        const d = new Date(brtTime.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        return d.toISOString().substring(0, 10); // YYYY-MM-DD
    };

    const strD = getBRTMidnight(0);
    const strD1 = getBRTMidnight(1);
    const strM = brtTime.toISOString().substring(0, 7) + '-01';
    const strY = brtTime.toISOString().substring(0, 4) + '-01-01';

    return {
        d_start: `${strD} 00:00:00`,
        d_end: `${strD} 23:59:59`,
        d1_start: `${strD1} 00:00:00`,
        d1_end: `${strD1} 23:59:59`,
        m_start: `${strM} 00:00:00`,
        y_start: `${strY} 00:00:00`
    };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendDailyReport(chatId: string, forceSync: boolean = false) {
    try {
        if (forceSync) {
            console.log(`[WhatsApp] 🕒 Iniciando Sync forçado para ${chatId}...`);
            await syncFinishedGMOs('TRO');
        }

        console.log(`[WhatsApp] 📊 Extraindo dados de D e D-1...`);
        const p = getDaysParamsBRT();
        
        const d1_data = getHistoryStats('TRO', p.d1_start, p.d1_end);
        const d_data = getHistoryStats('TRO', p.d_start, p.d_end);

        const m_data = getHistoryStats('TRO', p.m_start, p.d_end);
        const y_data = getHistoryStats('TRO', p.y_start, p.d_end);

        // 3. Dados Específicos de Rondonópolis (Origem)
        const roo_d1 = getHistoryStats('TRO', p.d1_start, p.d1_end, { origem: 'RONDONOPOLIS' });
        const roo_m = getHistoryStats('TRO', p.m_start, p.d_end, { origem: 'RONDONOPOLIS' });
        const roo_rca = db.prepare(`
            SELECT 
                gh.produto, gh.cliente as nome, 
                COUNT(*) as vol_acima, 
                AVG(gh.ciclo_total_h) as media_h,
                COALESCE(pt.meta_h, 46.5333) as meta_h,
                AVG(gh.fila_h) as media_fila,
                AVG(gh.viagem_h) as media_viagem,
                AVG(gh.interno_h) as media_interno
            FROM gmo_history gh
            LEFT JOIN plaza_targets pt ON gh.terminal = pt.terminal AND gh.origem = pt.origem
            WHERE gh.terminal = 'TRO' AND gh.origem = 'RONDONOPOLIS'
              AND gh.dt_peso_saida >= ? AND gh.dt_peso_saida <= ? 
              AND gh.ciclo_total_h > COALESCE(pt.meta_h, 46.5333) 
            GROUP BY gh.produto, gh.cliente 
            ORDER BY vol_acima DESC 
            LIMIT 2
        `).all(p.d1_start, p.d1_end);
        
        const root_causes = db.prepare(`
            SELECT 
                gh.origem, gh.produto, gh.cliente as nome, 
                COUNT(*) as vol_acima, 
                AVG(gh.ciclo_total_h) as media_h,
                COALESCE(pt.meta_h, 46.5333) as meta_h,
                AVG(gh.fila_h) as media_fila,
                AVG(gh.viagem_h) as media_viagem,
                AVG(gh.interno_h) as media_interno
            FROM gmo_history gh
            LEFT JOIN plaza_targets pt ON gh.terminal = pt.terminal AND gh.origem = pt.origem
            WHERE gh.terminal = 'TRO' 
              AND gh.dt_peso_saida >= ? 
              AND gh.dt_peso_saida <= ? 
              AND gh.ciclo_total_h > COALESCE(pt.meta_h, 46.5333) 
            GROUP BY gh.origem, gh.produto, gh.cliente 
            ORDER BY vol_acima DESC 
            LIMIT 3
        `).all(p.d1_start, p.d1_end);

        console.log(`[WhatsApp] 🧠 Invocando Gemini...`);
        const relatorio = await formatWhatsAppSummary(d_data, d1_data, m_data, y_data, root_causes, { roo_d1, roo_m, roo_rca });

        // Mais robusto para evitar erro de LID: buscar o chat primeiro
        const chat = await client.getChatById(chatId);
        await chat.sendMessage(relatorio);
        
        console.log(`[WhatsApp] 🚀 Relatório enviado com sucesso para ${chatId}!`);
    } catch (e) {
        console.error("[WhatsApp] Erro ao enviar relatório:", e);
    }
}

async function sendBulkReports() {
    console.log("[WhatsApp] 🚀 Iniciando disparo em massa...");
    const contacts = db.prepare("SELECT phone_number FROM whatsapp_contacts WHERE is_active = 1").all() as { phone_number: string }[];
    
    // Sincroniza uma vez antes de disparar para todos
    await syncFinishedGMOs('TRO');

    for (const c of contacts) {
        const chatId = c.phone_number.includes('@') ? c.phone_number : `${c.phone_number}@c.us`;
        await sendDailyReport(chatId);
        await sleep(2000); // 2 segundos de pausa entre envios
    }
}

function startCronJobs() {
    // Roda as 06:00 BRT. Usando timezone de São Paulo para blindar horário de verão.
    console.log("[WhatsApp] ⏰ Agendando tarefa: Todo dia às 06:00 BRT");
    cron.schedule('0 6 * * *', async () => {
        console.log("\n[WhatsApp/Cron] 🌅 Acionando rotina de disparo dās 06:00...");
        await sendBulkReports();
    }, {
        timezone: "America/Sao_Paulo"
    });
}

client.initialize();
