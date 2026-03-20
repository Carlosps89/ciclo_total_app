import axios from 'axios';
import { SignJWT } from 'jose';

const BASE_URL = 'http://localhost:3000/api/pac';
const SECRET_KEY = 'rumo-pac-mission-control-secret-key-2026'; // Da middleware.ts
const key = new TextEncoder().encode(SECRET_KEY);

async function generateToken() {
    return await new SignJWT({ user: { role: 'ADMIN' } })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(key);
}

const ENDPOINTS = [
    '/ciclo-total?terminal=TRO',
    '/ciclo-hourly?terminal=TRO',
    '/antecipacoes?terminal=TRO'
];

async function testCacheEffectiveness() {
    console.log('🚀 Iniciando teste de efetividade de cache com Autenticação (Alvo: 15 minutos)');
    const token = await generateToken();
    const config = {
        headers: {
            Cookie: `session=${token}`
        }
    };
    
    for (const endpoint of ENDPOINTS) {
        console.log(`\n--- Testando Endpoint: ${endpoint} ---`);
        
        try {
            // Primeira chamada
            console.log('Chamada 1: Enviando...');
            const start1 = Date.now();
            const res1 = await axios.get(`${BASE_URL}${endpoint}`, config);
            const duration1 = Date.now() - start1;
            console.log(`Status 1: ${res1.status}`);
            console.log(`Dados 1: ${JSON.stringify(res1.data).substring(0, 100)}...`);
            console.log(`Duração 1: ${duration1}ms`);
            
            // Segunda chamada (deve vir do cache)
            console.log('Chamada 2: Enviando imediatamente após...');
            const start2 = Date.now();
            const res2 = await axios.get(`${BASE_URL}${endpoint}`, config);
            const duration2 = Date.now() - start2;
            console.log(`Status 2: ${res2.status}`);
            console.log(`Duração 2: ${duration2}ms (Cache Hit sugerido)`);
            
            if (duration2 < duration1 && duration2 < 100) {
                console.log('✅ SUCESSO: Cache funcionando!');
            } else {
                console.log('⚠️ AVISO: Performance de cache não conclusiva ou lentidão na rede local.');
            }

            if (res1.data.error || res1.data.message?.includes('failed')) {
                console.log('❌ ERRO NOS DADOS: O servidor está retornando um erro (provavelmente Athena/AWS Auth).');
            }
        } catch (err: any) {
            console.error(`❌ Falha ao acessar endpoint ${endpoint}:`, err.message);
            if (err.response) {
                console.error('Status Error:', err.response.status);
                console.error('Data Error:', err.response.data);
            }
        }
    }
}

testCacheEffectiveness().catch(err => {
    console.error('❌ Erro no teste:', err.message);
    console.log('Certifique-se de que o servidor local está rodando em http://localhost:3000');
});
