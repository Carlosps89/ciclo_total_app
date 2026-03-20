import { NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { processAgentCommand } from '@/lib/agent/agent-service';
import { generateChartBuffer } from '@/lib/agent/chart-gen';
import axios from 'axios';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || "");

// Whitelist of allowed Telegram User IDs
// TODO: User should populate this or we can log ID for first contact
const WHITELISTED_USERS = [
  // Add IDs here
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Manual Telegraf handle for Next.js Route
    if (body.message) {
      const chatId = body.message.chat.id;
      const userId = body.message.from.id;
      const text = body.message.text;
      const voice = body.message.voice;

      console.log(`[Bot] Mensagem recebida de ${userId}: ${text || 'Voz'}`);

      // Basic Security Check (Optional - can be enabled later)
      /*
      if (WHITELISTED_USERS.length > 0 && !WHITELISTED_USERS.includes(userId)) {
        await bot.telegram.sendMessage(chatId, "❌ Desculpe, você não tem autorização para acessar este sistema.");
        return NextResponse.json({ ok: true });
      }
      */

      let command = text;
      let audioData = undefined;

      // Handle Voice Messages
      if (voice) {
        await bot.telegram.sendChatAction(chatId, 'typing');
        const fileLink = await bot.telegram.getFileLink(voice.file_id);
        
        // Download audio
        const audioResponse = await axios.get(fileLink.toString(), { responseType: 'arraybuffer' });
        audioData = {
          buffer: Buffer.from(audioResponse.data),
          mimeType: 'audio/ogg' // Telegram default
        };
        
        await bot.telegram.sendMessage(chatId, "🎤 Recebi seu áudio. Processando análise multimodal...");
      }

      if (!command && !audioData) return NextResponse.json({ ok: true });

      // Process with Agent
      await bot.telegram.sendChatAction(chatId, 'typing');
      const agentRes = await processAgentCommand(command || "", audioData);

      // Send Results
      await bot.telegram.sendMessage(chatId, agentRes.text, { parse_mode: 'Markdown' });

      // Send Chart if available
      if (agentRes.chartData && agentRes.chartType) {
        const chartBuffer = await generateChartBuffer(agentRes.chartType, agentRes.chartData);
        await bot.telegram.sendPhoto(chatId, { source: chartBuffer }, { caption: `Gráfico de ${agentRes.chartType}` });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Bot Webhook Error]:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
