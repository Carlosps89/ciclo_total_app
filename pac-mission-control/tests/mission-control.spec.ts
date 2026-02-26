import { test, expect } from '@playwright/test';

test.describe('PAC Mission Control (CCO)', () => {

    // Mock API responses before each test
    test.beforeEach(async ({ page }) => {
        await page.route('*/**/api/pac/summary*', async route => {
            await route.fulfill({
                json: {
                    terminal: 'TRO',
                    updated_at: new Date().toISOString(),
                    stages: {
                        aguardando_agendamento: { stage: 'Aguardando Agendamento', avg_h: 2.5, p95_h: 3.0, volume: 100, meta_h: 2.0, status: 'yellow' },
                        tempo_viagem: { stage: 'Tempo de Viagem', avg_h: 4.8, p95_h: 5.5, volume: 90, meta_h: 5.0, status: 'green' },
                        tempo_interno: { stage: 'Tempo Interno', avg_h: 1.2, p95_h: 1.5, volume: 80, meta_h: 1.0, status: 'red' }
                    }
                }
            });
        });

        await page.route('*/**/api/pac/ciclo-total*', async route => {
            await route.fulfill({
                json: {
                    terminal: 'TRO',
                    updated_at: new Date().toISOString(),
                    ciclo_total: {
                        hora_atual: { label: 'Hora', avg_h: 5.0, p50_h: 4.5, p95_h: 6.0, volume: 10 },
                        dia: { label: 'Dia', avg_h: 5.2, p50_h: 4.8, p95_h: 6.5, volume: 150 },
                        mes: { label: 'Mês', avg_h: 5.5, p50_h: 5.0, p95_h: 7.0, volume: 4000 },
                        ano: { label: 'Ano', avg_h: 5.6, p50_h: 5.1, p95_h: 7.2, volume: 50000 },
                    }
                }
            });
        });

        await page.route('*/**/api/pac/outliers*', async route => {
            await route.fulfill({
                json: {
                    terminal: 'TRO',
                    updated_at: new Date().toISOString(),
                    items: [
                        { gmo_id: '123456', placa: 'ABC1234', origem: 'ORIGEM A', terminal: 'TRO', etapa: 'Tempo Interno', valor_h: 12.5 },
                        { gmo_id: '789012', placa: 'XYZ9876', origem: 'ORIGEM B', terminal: 'TRO', etapa: 'Tempo Viagem', valor_h: 10.0 }
                    ]
                }
            });
        });

        await page.route('*/**/api/pac/antecipacoes*', async route => {
            await route.fulfill({
                json: {
                    terminal: 'TRO',
                    updated_at: new Date().toISOString(),
                    antecipando_agora: { count: 5, pct: 10 },
                    base_agora: { count_total: 50 },
                    top_origens: [{ origem: 'ORIGEM C', count: 3 }, { origem: 'ORIGEM D', count: 2 }]
                }
            });
        });
    });

    test('should load the dashboard and show CCO header', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await expect(page.locator('h1')).toContainText('PAC - CENTRO DE CONTROLE');
        await expect(page.getByTestId('dashboard-cco')).toBeVisible();
    });

    test('should display Cycle Total buckets', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await expect(page.getByText('Ciclo Total - Hora', { exact: false })).toBeVisible();
        await expect(page.getByText('Ciclo Total - Ano', { exact: false })).toBeVisible();
        await expect(page.getByText('5.0').first()).toBeVisible(); // Avg Hour mocked
    });

    test('should display outliers', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await expect(page.getByText('ABC1234')).toBeVisible();
        await expect(page.getByText('12.5h')).toBeVisible();
    });

    test('TV Mode should maintain overflow hidden', async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('http://localhost:3000?mode=tv');
        const container = page.getByTestId('dashboard-cco');
        await expect(container).toHaveClass(/h-screen/);
        await expect(container).toHaveClass(/overflow-hidden/);
    });
});
