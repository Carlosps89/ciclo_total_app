import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { processPrescriptiveLogic } from '@/lib/prescriptive-engine';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const terminal = searchParams.get('terminal') || 'TRO';
  const runPrescriptive = searchParams.get('run_prescriptive') === 'true';

  try {
    // 1. Dados Históricos (últimos 30 dias de features)
    const history = db.prepare(`
      SELECT day, volume, avg_ciclo_total_h as ciclo_h, 
             load_programado, load_fila_externa, load_transito, load_fila_interna, 
             'REAL' as type 
      FROM gmo_features 
      WHERE terminal = ? AND day >= date('now', '-15 days')
      ORDER BY day ASC
    `).all(terminal);

    // 2. Dados Projetados (próximos 7 dias)
    const forecast = db.prepare(`
      SELECT day, pred_volume as volume, pred_ciclo_total_h as ciclo_h, 
             pred_load_programado as load_programado, 
             pred_load_fila_externa as load_fila_externa, 
             pred_load_transito as load_transito, 
             pred_load_fila_interna as load_fila_interna, 
             recom_acao, insight_ia, 'PROJ' as type
      FROM gmo_forecast
      WHERE terminal = ? AND day >= date('now')
      ORDER BY day ASC
    `).all(terminal);

    // 3. (Opcional) Rodar motor prescritivo para atualizar insight
    let insightia = forecast.length > 0 ? (forecast[0] as any).insight_ia : null;
    if (runPrescriptive) {
        const prescriptiveResult = await processPrescriptiveLogic(terminal);
        insightia = (prescriptiveResult as any).insight;
    }

    return NextResponse.json({
      terminal,
      history,
      forecast,
      insight_ia: insightia,
      meta_h: 46.5333 // Fallback meta
    });

  } catch (error) {
    console.error("Forecast API Error:", error);
    return NextResponse.json({ error: 'Falha ao buscar projeções' }, { status: 500 });
  }
}
