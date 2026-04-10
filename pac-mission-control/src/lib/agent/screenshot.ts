import puppeteer from 'puppeteer';
import { SignJWT } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'rumo-pac-mission-control-secret-key-2026';
const key = new TextEncoder().encode(JWT_SECRET);
const BOT_ACCESS_TOKEN = process.env.BOT_ACCESS_TOKEN || 'rumo-pac-bot-secret-key-2026';
const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function generateBotSession() {
    const payload = {
        user: {
            id: 'bot-analyst',
            name: 'PAC Bot Analyst',
            email: 'bot@rumo.com',
            role: 'ADM'
        },
        expires: new Date(Date.now() + 60 * 60 * 1000) // 1 hora
    };

    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(key);
}

export async function captureDashboardScreenshot(path: string = '/'): Promise<Buffer> {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    });

    try {
        const page = await browser.newPage();
        const targetUrl = `${DASHBOARD_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
        
        // Alta Definição
        await page.setViewport({
            width: 1200, // Ajustado para formato de gráfico mobile/social
            height: 800,
            deviceScaleFactor: 2 // HD
        });

        // Configurar Header de Bypass (Back-up)
        await page.setExtraHTTPHeaders({
            'x-pac-bot-token': BOT_ACCESS_TOKEN
        });

        // Gerar e Injetar Cookie de Sessão (Principal para evitar redirect)
        const sessionToken = await generateBotSession();
        const cookieDomain = new URL(DASHBOARD_URL).hostname;
        
        await page.setCookie({
            name: 'session',
            value: sessionToken,
            domain: cookieDomain,
            path: '/',
            httpOnly: true,
            secure: DASHBOARD_URL.startsWith('https')
        });

        console.log(`[Screenshot] Navegando para ${targetUrl}...`);
        
        // Navegar e esperar carregamento dos dados
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Aguarda até que o dashboard tenha dados reais (não apenas o estado de loading)
        console.log(`[Screenshot] Aguardando renderização dos dados...`);
        try {
            await page.waitForFunction(() => {
                const bodyText = document.body.innerText;
                // Espera as mensagens de carregamento sumirem e os números aparecerem
                // Verificamos por classes comuns de valores no dashboard (font-black, big-number, etc)
                const isLoading = bodyText.includes('Carregando dados') || 
                                bodyText.includes('CARREGANDO DADOS');
                const hasValueElements = document.querySelectorAll('.font-black').length > 5 || 
                                       document.querySelectorAll('canvas').length > 0;
                
                return !isLoading && hasValueElements;
            }, { timeout: 30000 });
            
            // Pequeno respiro extra para as animações de entrada dos gráficos (Chart.js) ficarem nítidas
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
            console.warn("[Screenshot] Timeout aguardando dados reais, capturando estado atual.");
        }

        // Remover elementos que poluem o print
        await page.evaluate(() => {
            const elementsToRemove = [
                'button[aria-label="Menu"]', 
                '.fixed.inset-y-0.right-0',
                'header',
                'nav',
                '#next-build-watcher'
            ];
            elementsToRemove.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => (el as HTMLElement).style.display = 'none');
            });
            // Opcional: Forçar fundo preto sólido para evitar transparências no print
            document.body.style.background = '#0a0a0a';
        });

        console.log(`[Screenshot] Capturando tela de ${targetUrl}...`);
        const screenshot = await page.screenshot({
            type: 'jpeg',
            quality: 90,
            fullPage: false
        }) as Buffer;

        return screenshot;

    } finally {
        await browser.close();
    }
}
