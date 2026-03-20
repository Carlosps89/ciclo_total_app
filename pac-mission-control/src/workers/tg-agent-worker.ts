import dotenv from 'dotenv';
import path from 'path';

// Carregar .env.local ANTES de qualquer outro import interno
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const version = "v2.1";
console.log(`[Worker ${version}] Verificando Variáveis de Ambiente:`);
console.log(` - TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Presente' : '❌ AUSENTE'}`);
console.log(` - GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? `✅ Presente (${process.env.GEMINI_API_KEY.substring(0, 4)}...${process.env.GEMINI_API_KEY.slice(-3)})` : '❌ AUSENTE'}`);
console.log(` - ATHENA_OUTPUT_S3: ${process.env.ATHENA_OUTPUT_S3 ? '✅ Presente' : '❌ AUSENTE'}`);

import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import axios from 'axios';
import { processAgentCommand } from '../lib/agent/agent-service';
import { generateChartBuffer } from '../lib/agent/chart-gen';

// Initialize Bot with Token from .env
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(`[Worker ${version}] ERRO: TELEGRAM_BOT_TOKEN não encontrado no .env`);
  process.exit(1);
}

const bot = new Telegraf(token);

console.log(`[Worker ${version}] Iniciando Bot PAC Insight em modo Long Polling...`);

// --- Middleware de Logs/Segurança ---
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`[Bot ${version}] ${ctx.from?.username || ctx.from?.id} -> Resposta em ${ms}ms`);
});

// --- Handler de Voz ---
bot.on(message('voice'), async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const voice = ctx.message.voice;
    const fileLink = await ctx.telegram.getFileLink(voice.file_id);
    
    console.log(`[Voice ${version}] Recebido áudio de ${ctx.from.id}. Key: ${process.env.GEMINI_API_KEY ? 'Sim' : 'Não'}`);
    
    const audioResponse = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
    const audioData = {
      buffer: Buffer.from(audioResponse.data),
      mimeType: 'audio/ogg'
    };

    await ctx.reply("🎤 Recebi seu áudio. Analisando ciclo...");

    const agentRes = await processAgentCommand("", audioData);
    await ctx.reply(agentRes.text, { parse_mode: 'Markdown' });

    if (agentRes.chartData && agentRes.chartType) {
      const chartBuffer = await generateChartBuffer(agentRes.chartType, agentRes.chartData);
      await ctx.sendPhoto({ source: chartBuffer }, { caption: `📊 Gráfico gerado (${agentRes.chartType})` });
    }

  } catch (error) {
    console.error(`[Bot Error ${version} - Voice]:`, error);
    await ctx.reply("⚠️ Tive um problema ao processar seu áudio. Tente novamente.");
  }
});

// --- Handler de Texto ---
bot.on(message('text'), async (ctx) => {
  try {
    const text = ctx.message.text;
    console.log(`[Text ${version}] ${ctx.from.id}: ${text}. Key: ${process.env.GEMINI_API_KEY ? 'Sim' : 'Não'}`);

    await ctx.sendChatAction('typing');
    const agentRes = await processAgentCommand(text);

    await ctx.reply(agentRes.text, { parse_mode: 'Markdown' });

    if (agentRes.chartData && agentRes.chartType) {
      const chartBuffer = await generateChartBuffer(agentRes.chartType, agentRes.chartData);
      await ctx.sendPhoto({ source: chartBuffer }, { caption: `📊 Gráfico gerado (${agentRes.chartType})` });
    }

  } catch (error) {
    console.error(`[Bot Error ${version} - Text]:`, error);
    await ctx.reply("⚠️ Não consegui realizar essa análise agora. Tente me perguntar de outra forma.");
  }
});

// Comando de Início
bot.command('start', (ctx) => {
  ctx.reply('👋 Olá! Sou o PAC Insight. Envie uma mensagem de texto ou áudio para analisar o ciclo rodoviário.');
});

// Inicia o Polling
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log(`[Worker ${version}] Bot operacional e ouvindo mensagens.`);
