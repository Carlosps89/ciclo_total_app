import { GoogleGenerativeAI } from "@google/generative-ai";
import { runQuery, getAthenaDatabase, getAthenaView } from "../athena";
import { ResultSet } from "@aws-sdk/client-athena";

const getGenAI = () => {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment variables");
  }
  return new GoogleGenerativeAI(apiKey);
};

// Helper simples para escapar o básico e evitar quebras no Telegram (Markdown V1)
function toMarkdownSafeV1(text: string): string {
  if (!text) return "";
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/`/g, '\\`');
}

export interface AgentResponse {
  text: string;
  chartData?: any;
  chartType?: 'bar' | 'line' | 'pie' | 'histogram';
}

export async function processAgentCommand(command: string, audio?: { buffer: Buffer, mimeType: string }): Promise<AgentResponse> {
  const genAI = getGenAI();
  const modelName = "gemini-flash-latest";
  const db = getAthenaDatabase();
  const table = getAthenaView();
  
  console.log(`[Agent] Iniciando processamento com o modelo: ${modelName}`);
  
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `
    Você é o "PAC Insight", o assistente analista sênior da Rumo SLog.
    Sua missão: Converter perguntas em SQL analítico e insights para o AWS Athena.

    DATABASE: "${db}"
    TABLE/VIEW: "${table}"

    REGRAS DE ANÁLISE POR ETAPA:
    - Se o usuário pedir para "detalhar", "comparar etapas" ou "entender o ciclo" de um terminal específico (ex: TRO):
      1. Gere um SQL que traga as MÉDIAS das etapas: "aguardando_agendamento_h", "tempo_viagem_h" e "ciclo_interno_h".
      2. Compare os valores para identificar qual é o maior "ofensor" (gargalo).
    - Métrica de Suporte: "ciclo_total_h" é a soma das etapas.

    REGRAS DE TEMPO:
    - "Xh de hoje": Filtro de horário na coluna 'peso_saida' ou 'emissao_nota'.
    - Use 'current_date' para hoje.

    COLUNAS DISPONÍVEIS:
    "gmo_id", "emissao_nota", "agendamento", "janela_agendamento", "chegada", "peso_saida", 
    "ciclo_total_h", "aguardando_agendamento_h", "tempo_viagem_h", "ciclo_interno_h", 
    "placa_tracao", "terminal", "cliente", "cheguei", "chamada"

    DEDUPLICAÇÃO OBRIGATÓRIA:
    Sempre use: ROW_NUMBER() OVER (PARTITION BY gmo_id ORDER BY peso_saida DESC) as rn ... WHERE rn = 1.

    SAÍDA ESPERADA (JSON APENAS):
    {
      "sql": "query aqui",
      "explanation": "o que você vai analisar",
      "visualHint": "bar" | "line" | "text" | "histogram"
    }
  `;

  try {
    const parts: any[] = [{ text: prompt }];
    
    if (audio) {
      parts.push({
        inlineData: { data: audio.buffer.toString("base64"), mimeType: audio.mimeType },
      });
      parts.push({ text: `COMANDO DE VOZ: Detalhe o ciclo e as etapas.` });
    } else {
      parts.push({ text: `COMANDO: "${command}"` });
    }

    console.log("[Agent] Solicitando SQL...");
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    console.log(`[Agent] SQL Gerado:\n${parsed.sql}`);

    const queryResult = await runQuery(parsed.sql);
    
    const rows = queryResult?.Rows?.slice(1).map((r: any) => r.Data.map((d: any) => d.VarCharValue)) || [];
    const headers = queryResult?.Rows?.[0]?.Data?.map((d: any) => d.VarCharValue) || [];

    const analysisPrompt = `
      Você é o Analista do CCO. Forneça um insight EXECUTIVO, PROFISSIONAL e COMPARATIVO.
      Se os dados mostrarem as etapas do ciclo (Aguardando, Viagem, Interno), identifique CLARAMENTE qual delas está puxando a média para cima.
      Não invente metas. Use os números reais.

      DADOS DO ATHENA:
      Headers: ${JSON.stringify(headers)}
      Linhas: ${JSON.stringify(rows.slice(0, 10))}

      PERGUNTA DO USUÁRIO: "${command || 'Áudio recebido'}"
    `;

    const finalResult = await model.generateContent(analysisPrompt);
    const insightText = finalResult.response.text();

    const dataSnapshot = rows.length > 0 
      ? `\n\n📊 *Resumo dos Dados:*\n\`${headers.join(' | ')}\`\n${rows.slice(0, 5).map(r => `\`${r.join(' | ')}\``).join('\n')}`
      : `\n\n⚠️ _Nenhum dado encontrado para os filtros aplicados._`;

    const finalResponseText = `
${insightText}

---
🔎 *Debug Info (SQL):*
\`\`\`sql
${parsed.sql}
\`\`\`
${dataSnapshot}
    `.trim();

    return {
      text: finalResponseText,
      chartData: parsed.visualHint !== 'text' && rows.length > 0 ? { headers, rows } : undefined,
      chartType: parsed.visualHint !== 'text' && rows.length > 0 ? parsed.visualHint : undefined
    };

  } catch (error: any) {
    console.error("[Agent Error]:", error);
    return { text: "❌ *Erro*: " + toMarkdownSafeV1(error?.message || "Erro inesperado") };
  }
}
