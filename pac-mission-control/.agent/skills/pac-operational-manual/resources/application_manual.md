<style>
  .section {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-bottom: 24px;
    padding: 20px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin-top: 12px;
    border: 1px solid #f1f5f9;
  }
  h2 {
    margin-top: 0;
    color: #1e40af;
    border-bottom: 2px solid #3b82f6;
    padding-bottom: 8px;
    display: inline-block;
  }
  body {
    background: #f8fafc;
    color: #334155;
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
  }
  hr {
    border: none;
    height: 1px;
    background: #e2e8f0;
    margin: 32px 0;
  }
  .highlight {
    color: #2563eb;
    font-weight: 700;
  }
</style>

# 📖 Manual Visual de Operação - PAC Mission Control

Este manual foi desenvolvido para o **Centro de Controle Rodoviário**, fornecendo um guia visual e prático para a gestão do ciclo rodoviário 24h.

---

<div class="section">

## 🖥️ 1. Dashboard Principal (Home)
Onde você monitora a saúde da operação em tempo real.

![Dashboard Principal](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/home_dashboard_1773408646026.png)

### Como Operar:
1.  **Cards Superiores:** Acompanhe o volume e o ciclo atual por terminal.
2.  **Cockpit de Performance:** Clique no gráfico circular para abrir o Cockpit e ver a projeção do mês.
3.  **Cores de Alerta:** 🟢 Verde (Meta), 🟡 Amarelo (Atenção), 🔴 Vermelho (Ação Imediata).

</div>

<div class="section">

## 🧪 2. Simulador de Meta 40H
Use esta tela para planejar a recuperação do indicador quando ele estiver no vermelho.

![Simulador de Ciclo](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/simulator_1773408695445.png)

### Passo a Passo para Simulação:
1.  **Ajuste o Volume Diário:** Mova o slider para refletir a carga futura.
2.  **Defina Ciclos Diários:** Planeje o que o pátio precisa entregar.
3.  **Resultado Projetado:** Veja se a meta de 40h será atingida no fim do mês.

</div>

<div class="section">

## 🔍 3. Motor de Diagnóstico (Outliers)
Identifique as placas que estão "puxando a média para cima".

![Diagnóstico de Anomalias](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/outliers_engine_1773408974361.png)

### Como Analisar:
*   **Gráfico de Barras:** Identifica o atraso por etapa do ciclo.
*   **Simulação What-If:** Mostra o ciclo real caso as anomalias fossem resolvidas.

</div>

<div class="section">

## 🔎 4. Detalhamento de Causa Raiz (Drilldown)
Clique em uma barra do gráfico de outliers para ver as placas específicas.

![Drilldown Modal](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/drilldown_modal_1773409059499.png)

### Recursos Úteis:
*   **Mapa de Calor:** Identifique turnos críticos de atraso.
*   **Lista de Placas:** Copie as placas para cobrar os terminais/transportadoras.

</div>

<div class="section">

## 📈 5. Histórico e Sazonalidade
Visualização de padrões de longo prazo e sazonalidade semanal.

![Histórico Heatmap](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/historical_heatmap_1773408870970.png)

*   **Padrão Semanal:** Identifique gargalos recorrentes no pátio ou viagem.
*   **Tendência:** Verifique visualmente a eficácia das ações anteriores.

</div>

<div class="section">

## 🛡️ 6. Cockpit de Performance (Premium)
O Cockpit é o centro de controle tático para gestores com visão consolidada e gauge de performance.

![Cockpit de Performance](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/performance_cockpit_v3_1773410204908.png)

### Funções Principal:
*   **Velocímetro:** Ciclo projetado vs Meta 40h.
*   **Simulação Rápida:** Atalho para planejamento de metas imediatas.

</div>

<div class="section">

## ⛓️ 7. Ciclo por Etapas em Tempo Real
Identificação de gargalos em tempo real nos processos logísticos.

![Projeção de Fila](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/queue_projection_v3_1773410308237.png)

*   **Identificação de Represamento:** Placas com ciclos elevados em etapas finais indicam gargalos administrativos ou de pátio anteriores.

</div>

<div class="section">

## 🗺️ 8. Mapa de Origens e Ranking
Análise geográfica de performance e ranking regional de origens.

![Mapa de Origens](/Users/carlospereira/.gemini/antigravity/brain/a0754327-77f9-4d8b-a3e3-0aafc0874e67/origins_map_v3_1773410441418.png)

*   **Ranking:** Identifique as praças ofensoras do indicador de ciclo.

</div>

---

## 🛠️ Suporte e Manutenção
*   **Filtros:** Use o menu lateral para trocar de Terminal.
*   **Exportação:** Gere relatórios em Excel das anomalias encontradas.
