import db from './db';
import { generatePrescriptiveInsight } from './agent/prescriptive-ai';

export interface ForecastRecord {
  day: string;
  terminal: string;
  pred_volume: number;
  pred_fila_h: number;
  taxa_antecipacao_atual: number;
  recom_acao: string;
  insight_ia: string;
}

export async function processPrescriptiveLogic(terminal: string = 'TRO') {
  console.log(`🧠 Acionando Motor Prescritivo para ${terminal}...`);

  try {
    // 1. Buscar projeções mais recentes
    const forecast = db.prepare(`
        SELECT * FROM gmo_forecast 
        WHERE terminal = ? AND day >= date('now')
        ORDER BY day ASC LIMIT 7
    `).all(terminal) as ForecastRecord[];

    if (forecast.length === 0) {
      return { error: 'Sem dados de forecast para processar.' };
    }

    // 2. Buscar Benchmarks e Médias Históricas por Dia da Semana
    const benchmarks = db.prepare("SELECT * FROM operational_benchmarks").all();
    const weekdayAvg = db.prepare(`
        SELECT 
            strftime('%w', day) as dow,
            AVG(volume) as avg_vol,
            AVG(avg_ciclo_total_h) as avg_ciclo
        FROM gmo_features
        WHERE terminal = ?
        GROUP BY dow
    `).all(terminal);
    
    const targets = {
        meta_h: (db.prepare("SELECT meta_h FROM plaza_targets WHERE terminal = ? AND origem = 'GLOBAL'").get(terminal) as any)?.meta_h || 46.5333,
        benchmarks,
        history_weekday_averages: weekdayAvg
    };

    // 3. Gerar Insight Executivo via Gemini
    const insight = await generatePrescriptiveInsight(forecast, targets, { current_terminal: terminal });

    // 4. Atualizar o banco com o Insight de IA (Salvamos no primeiro dia da projeção como referência)
    const updateStmt = db.prepare(`
        UPDATE gmo_forecast 
        SET insight_ia = ? 
        WHERE terminal = ? AND day = ?
    `);
    
    updateStmt.run(insight, terminal, forecast[0].day);

    return {
        success: true,
        terminal,
        forecast,
        insight
    };

  } catch (error) {
    console.error("Prescriptive Engine Error:", error.message);
    return {
        success: false,
        terminal,
        insight: "⚠️ Motor Prescritivo indisponível no momento (Erro de Conexão). Por favor, consulte o painel manualmente."
    };
  }
}
