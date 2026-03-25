import { execSync } from 'child_process';

const ONE_HOUR = 60 * 60 * 1000;

async function runSync() {
    console.log(`[${new Date().toISOString()}] Iniciando sincronização Athena...`);
    try {
        // Usa o binário local do tsx para rodar o sync
        execSync('npx tsx scripts/sync-snapshot.ts', { stdio: 'inherit' });
        console.log(`[${new Date().toISOString()}] Sincronização concluída com sucesso.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro na sincronização:`, error);
    }
}

async function start() {
    console.log("Serviço de Sincronização PAC iniciado via PM2.");
    
    while (true) {
        await runSync();
        console.log(`Aguardando 1 hora para a próxima atualização... [${new Date().toISOString()}]`);
        await new Promise(resolve => setTimeout(resolve, ONE_HOUR));
    }
}

start();
