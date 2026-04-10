import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { syncFinishedGMOs } from '../src/lib/sync-gmo';

async function main() {
    const terminal = 'TRO';
    console.log('--- INICIANDO DEEP SYNC 2026 ---');
    console.log('Este processo irá re-sincronizar todos os registros desde 01/01/2026 para preencher lacunas.');
    
    // Forçar o início em 01/01/2026
    await syncFinishedGMOs(terminal, { forceFromDate: '2026-01-01 00:00:00' });
    
    console.log('--- DEEP SYNC FINALIZADO ---');
}

main().catch(console.error);
