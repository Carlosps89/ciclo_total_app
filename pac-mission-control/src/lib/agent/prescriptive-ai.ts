import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Agente de IA Prescritiva (Gemini 1.5 Pro)
 * Especializado em Buffers Operacionais e Alertas de Fila.
 */
export async function generatePrescriptiveInsight(forecast: any[], targets: any, context: { current_terminal: string }) {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in .env.local");

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Upgrade para a nova geração (Gemini 3.1 Pro Preview) para maior inteligência analítica e raciocínio matemático
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.1-pro-preview",
    systemInstruction: `Você é o PAC Advisor, a inteligência central da Rumo Logística. 
    Sua missão é evitar o colapso operacional dos terminais através de análise preditiva de buffers.

    REGRAS DE OURO:
    1. FILA EXTERNA (Buffer 2): Se a projeção média for > 300 caminhões, você DEVE emitir um "🚨 PRIMEIRO AVISO: RISCO DE SATURAÇÃO EXTERNA".
    2. CICLO TOTAL: Se a projeção for maior que a meta (${targets.meta_h}h), mande reduzir antecipação para 0h.
    3. CORRELAÇÃO: Analise qual das 4 fases (Programado, Fila Externa, Trânsito ou Interna) está gerando mais impacto no Ciclo Total.
    4. HISTÓRICO: Use as médias históricas (History Weekday Averages) para validar se o aumento é sazonal ou anômalo.

    Estilo: Decisivo, executivo e focado em números.`
  });

  const prompt = `
    ANÁLISE DE TERMINAL: ${context.current_terminal}
    META DE CICLO (SLA): ${targets.meta_h}h
    MÉDIAS HISTÓRICAS (Dia da Semana): ${JSON.stringify(targets.history_weekday_averages)}
    
    PROJEÇÃO MULTI-BUFFER (PRÓXIMOS 7 DIAS):
    ${JSON.stringify(forecast.map(f => ({ 
        data: f.day, 
        volume: f.pred_volume,
        ciclo: f.pred_ciclo_total_h, 
        programado: f.pred_load_programado,
        fila_externa: f.pred_load_fila_externa,
        transito: f.pred_load_transito,
        fila_interna: f.pred_load_fila_interna,
        recom_estatistica: f.recom_acao 
    })), null, 2)}

    INSTRUÇÕES PARA O RELATÓRIO:
    - Se a Fila Externa projetada for > 300 em qualquer dia, comece com "🚨 PRIMEIRO AVISO".
    - Explique a correlação: "Identificamos que a maior retenção ocorre na [FASE], com média de [X] veículos...".
    - Seja claro sobre a Janela de Antecipação.
    
    FORMATO DE SAÍDA:
    📊 *INSIGHT PRESCRITIVO IA - ${context.current_terminal}*
    
    [Sua análise detalhada aqui]
    
    CCO Rodoviário RUMO`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini 1.5 Pro Prescriptive Error:", error);
    return "⚠️ Erro ao gerar insight da IA. Favor verificar o painel de forecast manualmente.";
  }
}
