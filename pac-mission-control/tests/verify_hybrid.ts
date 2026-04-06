import { getHistoryStats } from '../src/lib/db';
import { syncFinishedGMOs } from '../src/lib/sync-gmo';

async function test() {
    const terminal = 'TRO';
    console.log(`--- Iniciando Teste de Arquitetura Híbrida ---`);
    
    // 1. Sincronizar
    console.log(`Passe 1: Sincronizando dados recentes...`);
    await syncFinishedGMOs(terminal, 1);
    
    // 2. Verificar SQLite
    const start = '2026-01-01 00:00:00';
    const end = '2026-12-31 23:59:59';
    const stats = getHistoryStats(terminal, start, end);
    
    console.log(`Passe 2: Resultado do SQLite:`, stats);
    
    if (stats.vol > 0) {
        console.log(`✅ Sucesso! Dados persistidos localmente.`);
    } else {
        console.warn(`⚠️ Aviso: Nenhum dado encontrado no SQLite. Certifique-se de que a query do Athena retornou resultados.`);
    }
}

test().catch(console.error);
