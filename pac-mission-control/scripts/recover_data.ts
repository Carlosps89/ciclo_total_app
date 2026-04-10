import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { syncFinishedGMOs } from '../src/lib/sync-gmo';

async function main() {
    const terminal = 'TRO';
    console.log(`Iniciando recuperação de dados para ${terminal}...`);
    // Usamos forceFromDate ou apenas deixamos o novo logic de 2-day lookback agir
    // Para garantir que pegamos o dia 07/04, vamos forçar o lookback
    await syncFinishedGMOs(terminal);
    console.log('Sync finalizado.');
}

main().catch(console.error);
