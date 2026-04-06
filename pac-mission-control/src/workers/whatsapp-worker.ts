import dotenv from 'dotenv';
import path from 'path';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import { getHistoryStats } from '../lib/db';
import { formatWhatsAppSummary } from '../lib/agent/whatsapp-ai';

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

    if (msg.body.trim().toLowerCase() === '/resumo') {
        console.log(`[WhatsApp] Gatilho /resumo ativado!`);
        // Se a mensagem veio do meu próprio número (de mim para alguém/grupo)
        if (msg.fromMe) {
            await sendDailyReport(msg.to);
        } else {
            // Se alguém me mandou
            await sendDailyReport(msg.from);
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

async function sendDailyReport(chatId: string) {
    try {
        console.log(`[WhatsApp] 📊 Extraindo dados de D e D-1...`);
        const p = getDaysParamsBRT();
        
        const d1_data = getHistoryStats('TRO', p.d1_start, p.d1_end);
        const d_data = getHistoryStats('TRO', p.d_start, p.d_end);

        const m_data = getHistoryStats('TRO', p.m_start, p.d_end);
        const y_data = getHistoryStats('TRO', p.y_start, p.d_end);
        
        const db = require('../lib/db').default;
        const root_causes = db.prepare(`SELECT origem, produto, cliente as nome, COUNT(*) as vol_acima, AVG(ciclo_total_h) as media_h FROM gmo_history WHERE terminal = 'TRO' AND dt_peso_saida >= ? AND dt_peso_saida <= ? AND ciclo_total_h > 46.5333 GROUP BY origem, produto, cliente ORDER BY vol_acima DESC LIMIT 3`).all(p.d1_start, p.d1_end);

        console.log(`[WhatsApp] 🧠 Invocando Gemini...`);
        const relatorio = await formatWhatsAppSummary(d_data, d1_data, m_data, y_data, root_causes);

        await client.sendMessage(chatId, relatorio);
        console.log(`[WhatsApp] 🚀 Relatório enviado com sucesso!`);
    } catch (e) {
        console.error("[WhatsApp] Erro ao enviar relatório:", e);
    }
}

function startCronJobs() {
    // Roda as 06:00 BRT. Usando timezone de São Paulo para blindar horário de verão.
    console.log("[WhatsApp] ⏰ Agendando tarefa: Todo dia às 06:00 BRT");
    cron.schedule('0 6 * * *', async () => {
        console.log("\n[WhatsApp/Cron] 🌅 Acionando rotina de disparo dās 06:00...");
        if (myNumberId) {
            await sendDailyReport(myNumberId);
        }
    }, {
        timezone: "America/Sao_Paulo"
    });
}

client.initialize();
