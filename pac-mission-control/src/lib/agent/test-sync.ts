import * as dotenv from 'dotenv';
import path from 'path';

// Load environment from root .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { syncFinishedGMOs } from '../sync-gmo';

async function run() {
    console.log("🚀 Iniciando Sincronização Forçada (incluindo abertos)...");
    try {
        await syncFinishedGMOs('TRO', { daysLookback: 10 });
        console.log("✅ Sincronização concluída com sucesso!");
    } catch (e) {
        console.error("❌ Falha na sincronização:", e);
    }
}

run();
