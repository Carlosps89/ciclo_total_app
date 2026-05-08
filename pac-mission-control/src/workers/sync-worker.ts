import dotenv from 'dotenv';
import path from 'path';
import { syncFinishedGMOs } from '../lib/sync-gmo';

// Load Env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runSync() {
    console.log("=========================================");
    console.log("🔄 INICIANDO SINCRONIZAÇÃO MANUAL - PAC");
    console.log("=========================================");

    const args = process.argv.slice(2);
    const daysArg = args.find(a => a.startsWith('--days=') || a === '--days');
    let days = 2; // Default

    if (daysArg) {
        if (daysArg.includes('=')) {
            days = parseInt(daysArg.split('=')[1]);
        } else {
            const nextArg = args[args.indexOf('--days') + 1];
            if (nextArg) days = parseInt(nextArg);
        }
    }

    try {
        console.log(`[Worker] Sincronizando dados dos últimos ${days} dias...`);
        await syncFinishedGMOs('TRO', { daysLookback: days });
        console.log("✅ Sincronização concluída com sucesso!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Erro na sincronização:", error);
        process.exit(1);
    }
}

runSync();
