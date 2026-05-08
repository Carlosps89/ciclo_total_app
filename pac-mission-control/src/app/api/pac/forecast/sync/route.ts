import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';
import { processPrescriptiveLogic } from '@/lib/prescriptive-engine';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const terminal = searchParams.get('terminal') || 'TRO';

  console.log(`🔄 Iniciando Sincronização Manual do Pipeline de IA para ${terminal}...`);

  try {
    const baseDir = process.cwd();

    // 1. Extração de Features (TypeScript)
    console.log("➡️ Etapa 1: Extração de Features...");
    const extractPath = path.join(baseDir, 'scripts/predictive/extract-features.ts');
    // Usamos npx tsx para rodar o script diretamente
    execSync(`npx tsx ${extractPath}`, { stdio: 'inherit' });

    // 2. Motor de Forecast (Python)
    console.log("➡️ Etapa 2: Motor de Forecast (Python/Prophet)...");
    const forecastPath = path.join(baseDir, 'scripts/predictive/forecast-engine.py');
    execSync(`python3 ${forecastPath}`, { stdio: 'inherit' });

    // 3. Motor Prescritivo (Gemini 1.5 Pro)
    console.log("➡️ Etapa 3: Inteligência Prescritiva...");
    const prescriptiveResult = await processPrescriptiveLogic(terminal);

    return NextResponse.json({
      success: true,
      message: 'Pipeline de IA sincronizado com sucesso',
      insight: (prescriptiveResult as any).insight
    });

  } catch (error: any) {
    console.error("❌ Erro na Sincronização Manual:", error);
    return NextResponse.json({ 
      success: false, 
      error: 'Falha durante o processamento do pipeline de IA',
      details: error.message 
    }, { status: 500 });
  }
}
