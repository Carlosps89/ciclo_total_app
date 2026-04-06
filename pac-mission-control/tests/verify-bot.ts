import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { processAgentCommand } from '../src/lib/agent/agent-service';

async function testBotConsistency() {
  console.log("=== Testando PAC Insight (Alinhamento Dashboard) ===\n");

  const queries = [
    "Qual o ciclo total médio de hoje por terminal?",
    "Me dê o diagnóstico da hora 14:00 de hoje no terminal TRO",
    "Ranking dos 5 clientes com maior ciclo"
  ];

  for (const q of queries) {
    console.log(`\n> PERGUNTA: "${q}"`);
    try {
      const res = await processAgentCommand(q);
      console.log(`TEXTO: ${res.text.substring(0, 200)}...`);
      if (res.chartType) {
        console.log(`GRÁFICO: ${res.chartType}`);
      }
    } catch (e) {
      console.error("ERRO:", e);
    }
  }
}

testBotConsistency();
