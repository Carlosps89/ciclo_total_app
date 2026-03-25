import { getHistoryStats } from '../src/lib/db';
import { syncFinishedGMOs } from '../src/lib/sync-gmo';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function verify() {
    const terminal = 'TRO';
    console.log(`\n🔍 Verificando Resultado da Sincronização...`);
    
    // 1. Check volume
    const stats = getHistoryStats(terminal, '2026-01-01 00:00:00', '2026-12-31 23:59:59');
    console.log(`📊 Estatísticas do Ano (SQLite):`, stats);
    
    if (stats.vol > 0) {
        console.log(`✅ Sucesso! O banco de dados local foi preenchido.`);
    } else {
        console.error(`❌ Erro: O banco de dados local continua vazio.`);
        process.exit(1);
    }
    
    // 2. Test Incremental Sync Optimization
    console.log(`\n🔄 Testando Otimização Incremental (deve mostrar 0 novos registros)...`);
    await syncFinishedGMOs(terminal);
    
    console.log(`\n✨ Verificação concluída.`);
    process.exit(0);
}

verify().catch(err => {
    console.error(err);
    process.exit(1);
});
