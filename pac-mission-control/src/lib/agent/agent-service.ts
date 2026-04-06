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
  const isCleanData = table === 'pac_clean_data';
  
  console.log(`[Agent] Iniciando processamento com o modelo: ${modelName} (${isCleanData ? 'Snapshot' : 'Live'})`);
  
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `
    Você é o "PAC Insight", a inteligência analítica oficial do PAC MISSION (Rumo SLog).
    Sua missão: Fornecer os MESMOS números e diagnósticos do Dashboard Web.

    AMBIENTE:
    - Database: "${db}"
    - Tabela/Snapshot: "${table}"
    - Modo: ${isCleanData ? 'ALTA PERFORMANCE (Parquet)' : 'LEGACY (v1)'}

    REGRAS DE OURO (IDENTIDADE COM DASHBOARD):
    1. ${isCleanData ? 'NÃO use ROW_NUMBER(). Os dados já estão limpos e deduplicados na tabela pac_clean_data.' : 'USE ROW_NUMBER() per gmo_id para deduplicação.'}
    2. CICLO TOTAL: A métrica principal é 'avg(ciclo_total_h)'.
    3. TERMINAL PADRÃO: Se o usuário não especificar, use 'TRO'.
    4. FILTRO DE DATA (PARTIÇÃO): Use SEMPRE a coluna "dt" (varchar). 
       - Para hoje: \`dt = cast(current_date as varchar)\`
       - Para ontem: \`dt = cast(current_date - interval '1' day as varchar)\`
    5. DIAGNÓSTICO POR HORA: Para "o que houve na hora X", use:
       \`WHERE date_trunc('hour', peso_saida) = timestamp 'YYYY-MM-DD HH:00:00'\`

    COLUNAS DISPONÍVEIS:
    - gmo_id, terminal, placa_tracao, cliente, produto, origem
    - peso_saida (timestamp final), dt (partição string YYYY-MM-DD)
    - ciclo_total_h, tempo_interno_h, tempo_viagem_h, aguardando_agendamento_h

    EXEMPLOS DE CONSULTAS (Siga este estilo):
    - Ciclo Total: SELECT terminal, avg(ciclo_total_h) as media FROM "${db}"."${table}" WHERE dt = cast(current_date as varchar) GROUP BY 1 ORDER BY 2 DESC
    - Diagnóstico de Hora: SELECT * FROM "${db}"."${table}" WHERE terminal = 'TRO' AND date_trunc('hour', peso_saida) = timestamp '2026-03-25 14:00:00'
    - Ranking: SELECT cliente, avg(ciclo_total_h) FROM "${db}"."${table}" WHERE dt >= '2026-03-01' GROUP BY 1 ORDER BY 2 DESC LIMIT 5

    SAÍDA ESPERADA (JSON APENAS):
    {
      "sql": "query SQL otimizada",
      "explanation": "o que você está analisando",
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

    const queryResult = await runQuery(parsed.sql, 0, 'PAC_INSIGHT_BOT');
    
    const rows = queryResult?.Rows?.slice(1).map((r: any) => r.Data!.map((d: any) => d.VarCharValue)) || [];
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
      ? `\n\n📊 *Resumo dos Dados:*\n\`${headers.join(' | ')}\`\n${rows.slice(0, 5).map((r: any) => `\`${r.join(' | ')}\``).join('\n')}`
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
