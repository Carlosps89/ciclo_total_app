import { GoogleGenerativeAI } from "@google/generative-ai";

export async function formatWhatsAppSummary(d_data: any, d1_data: any, m_data: any, y_data: any, rca: any): Promise<string> {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in .env.local");
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest", generationConfig: { temperature: 0.2 }});

  const prompt = `Você é o PAC Insight, o analista oficial de logística do Centro de Controle (CCO) da Rumo.
Sua tarefa: Gerar um relatório analítico para WhatsApp. NUNCA chame os veículos atrasados de "fora do padrão", chame SEMPRE de "acima da Meta".

DADOS DA OPERAÇÃO DE ONTEM (Fechamento D-1):
- Volume Total: ${d1_data.vol} veículos
- Média do Ciclo: ${d1_data.avg_h?.toFixed(2) || 0}h
- Acima da Meta: ${d1_data.above_meta}

CENÁRIO CONSOLIDADO:
- Mês atual: ${m_data.vol} veículos com média de ${m_data.avg_h?.toFixed(2) || 0}h
- Ano atual: ${y_data.vol} veículos com média de ${y_data.avg_h?.toFixed(2) || 0}h

DADOS DE HOJE (Cenário atualizado na base local SQLite):
- Volume Recebido: ${d_data.vol} veículos
- Média do Ciclo Atual: ${d_data.avg_h?.toFixed(2) || 0}h
- Acima da Meta: ${d_data.above_meta}

DADOS CRUS DE RAIZ DE PROBLEMA (RCA OFFLINE):
${JSON.stringify(rca)}

FORMATE SUA RESPOSTA EXATAMENTE ASSIM E RESPEITE NOME DE TÍTULOS E ASSINATURA:

*Reporte Ciclo Rodoviario*

1. FECHAMENTO D-1 (Ontem):
[Faça sua breve introdução com os volumes e a média de D-1]

2. CONSOLIDADO (Mês e Ano):
[Liste de forma limpa o Volume e a Média de Ciclo atual do Mês e do Ano. Sempre traga volume e tempo]

3. CENÁRIO ATUAL (D):
[Informe o número MAIS ATUALIZADO do dia (não use o termo Madrugada). Cite o volume, ciclo e impacto atual]

4. PRINCIPAIS OFENSORES E ETAPAS (D-1):
[Usando estritamente os dados do objeto RCA OFFLINE fornecido, liste os principais ofensores informando a quantidade de veículos, a origem, o produto e a média real do ciclo (media_h). Como a base processada localmente não armazena o detalhamento por Fila/Viagem/Interno visando máxima performance, cite na resposta que a análise em tela daquela origem (com a quebra por sub-etapas frente ao P25) deve ser revisitada no Painel diretamente para identificar a causa raiz com exatidão.]

CCO Rodoviario RUMO`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
