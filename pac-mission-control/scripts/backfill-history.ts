import { syncFinishedGMOs } from '../src/lib/sync-gmo';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function backfill() {
    const terminal = process.argv.find(arg => arg.startsWith('--terminal='))?.split('=')[1] || 'TRO';
    const year = process.argv.find(arg => arg.startsWith('--year='))?.split('=')[1] || new Date().getFullYear().toString();
    
    console.log(`\n🚀 Iniciando Backfill de Dados Históricos...`);
    console.log(`📍 Terminal: ${terminal}`);
    console.log(`📅 Ano: ${year}`);
    
    const startOfYear = `${year}-01-01 00:00:00`;
    
    try {
        await syncFinishedGMOs(terminal, { forceFromDate: startOfYear });
        console.log(`\n✅ Backfill finalizado com sucesso para ${terminal} (${year}).`);
        process.exit(0);
    } catch (error) {
        console.error(`\n❌ Falha no backfill:`, error);
        process.exit(1);
    }
}

backfill();
