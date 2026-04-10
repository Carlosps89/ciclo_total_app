import { GoogleGenerativeAI } from "@google/generative-ai";

export async function formatWhatsAppSummary(d_data: any, d1_data: any, m_data: any, y_data: any, rca: any, roo_stats?: any): Promise<string> {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in .env.local");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest", generationConfig: { temperature: 0.2 }});
  
  // 1. Calcular Tendência (D-1 vs Mês)
  const d1_avg = d1_data.avg_h || 0;
  const m_avg = m_data.avg_h || 0;
  const trend_h = d1_avg - m_avg;
  const trend_icon = d1_avg <= m_avg ? "🟢 Melhorando" : "🔴 Degradando";

  // 2. Calcular Projeção de Fechamento (D)
  const now = new Date();
  const currentHour = (now.getUTCHours() - 3 + 24) % 24; // Simples conversão BRT
  const progress = Math.max(currentHour, 1) / 24;
  const projectedVol = Math.round(d_data.vol / progress);

  const prompt = `Você é o PAC Insight, o analista oficial de logística do Centro de Controle (CCO) da Rumo.
Sua tarefa: Gerar um relatório analítico para WhatsApp. NUNCA chame os veículos atrasados de "fora do padrão", chame SEMPRE de "acima da Meta".

META GLOBAL DE CICLO: 46.53h (Padrão para praças sem meta específica)
BENCHMARK P25 (EXCELÊNCIA): 40.00h

DADOS DA OPERAÇÃO DE ONTEM (Fechamento D-1):
- Volume Total: ${d1_data.vol} veículos
- Média do Ciclo: ${d1_data.avg_h?.toFixed(2) || 0}h
- Acima da Meta: ${d1_data.above_meta} (Comparado às metas específicas de cada origem)
- Tendência vs Mês: ${trend_h >= 0 ? '+' : ''}${trend_h.toFixed(2)}h (${trend_icon})

CENÁRIO CONSOLIDADO:
- Mês atual (MTD): ${m_data.vol} veículos com média de ${m_data.avg_h?.toFixed(2) || 0}h
- Ano atual (YTD): ${y_data.vol} veículos com média de ${y_data.avg_h?.toFixed(2) || 0}h

DADOS DE HOJE (Parcial D):
- Volume Recebido: ${d_data.vol} veículos
- Projeção de Fechamento: ~${projectedVol} veículos
- Média do Ciclo Atual: ${d_data.avg_h?.toFixed(2) || 0}h
- Acima da Meta: ${d_data.above_meta} (Comparado às metas específicas de cada origem)

DADOS CRUS DE RAIZ DE PROBLEMA (RCA):
${JSON.stringify(rca)}

DADOS ESPECÍFICOS RONDONÓPOLIS (Origem):
${JSON.stringify(roo_stats)}

INSTRUÇÕES DE FORMATAÇÃO:
- Use emojis para facilitar a leitura rápida.
- Seja profissional e direto.
- No item 2 (CONSOLIDADO), use apenas volume e tempo.
- No item 3 (CENÁRIO ATUAL), cite a Projeção de Fechamento.
- No item 4 (PRINCIPAIS OFENSORES), use os dados do RCA. Para cada item, mencione explicitamente a Meta daquela origem (campo meta_h). Ex: "TANGARA (Meta: 42h)". Identifique qual etapa (Fila, Viagem ou Interno) está puxando o ciclo e compare com o P25.
- No item 5 (FOCO PRAÇA RONDONÓPOLIS), faça um resumo rápido de Rondonópolis e seus principais impactos, também mencionando a meta específica aplicada.

FORMATE SUA RESPOSTA EXATAMENTE ASSIM:

*Reporte Ciclo Rodoviario*

1. FECHAMENTO D-1 (Ontem):
[Volumes, média e o sinalizador de tendência]

2. CONSOLIDADO (Mês e Ano):
[Volume e Ciclo]

3. CENÁRIO ATUAL (D):
[Volume atual, Projeção e Ciclo parcial]

4. PRINCIPAIS OFENSORES E ETAPAS (D-1):
[Análise detalhada por origem/produto usando as médias de Fila, Viagem e Interno.]

5. FOCO PRAÇA RONDONÓPOLIS:
[Resumo específico de Rondonópolis: fechamento ontem, acumulado mês e principais ofensores locais.]

CCO Rodoviario RUMO`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
