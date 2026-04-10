---
name: regras-de-negocio
description: Especificação definitiva das regras de negócio do PAC Mission Control, focando no cálculo do Ciclo Total (True Cycle).
---

# 📖 Regras de Negócio: PAC Mission Control

Este documento consolida as regras de negócio fundamentais para o cálculo e monitoramento do ciclo logístico no sistema. Esta é a **Fonte da Verdade** para métricas e KPIs.

## 1. O Ciclo Total (True Cycle)

O **Ciclo Total** representa o atrito logístico completo do veículo, desde o seu nascimento no sistema até a saída física do pátio.

### 1.1 Fórmula Definitiva
> **Ciclo Total** = `dt_peso_saida` - `dt_emissao`

*   **Início:** Data de Emissão (`dt_emissao`) da Nota Fiscal ou Pedido.
*   **Fim:** Data de Saída (`dt_peso_saida`) / Pesagem de Saída do terminal.
*   **Unidade:** Horas decimais (`date_diff('second', t1, t2) / 3600.0`).

### 1.2 Composição por Etapas
O Ciclo Total é a soma matemática de três fases distintas:
1.  **Fila (Aguardando Agendamento):** `dt_agendamento - dt_emissao`
2.  **Viagem (Trânsito Externo):** `dt_chegada - dt_agendamento`
3.  **Interno (Operação Terminal):** `dt_peso_saida - dt_chegada`

---

## 2. Regras de Integridade e Limpeza (Anti-Ghosting)

Para evitar poluição nos Dashboards e médias distorcidas:

*   **Filtro de Ruído:** Registros com Ciclo Total inferior a **1 hora** são descartados (`ciclo_total_h >= 1.0`).
*   **Escopo Operacional:** O sistema foca em Descarregamento Rodoviário. Operações de carregamento ferroviário são descartadas (`movimento != 'CARGA'`).
*   **Remoção de Fantasmas:**
    *   Veículos sem eventos há mais de **3 dias** são ignorados.
    *   Veículos em Fila Externa por mais de **48 horas** sem chamada são considerados erros operacionais e removidos da visão de Forecast.

---

## 3. Benchmarks e Metas

A performance é avaliada comparando o Ciclo Total Real contra metas predefinidas:

*   **Meta por Praça (Diferencial):** Prioridade para metas específicas configuradas por cidade de origem/praça.
*   **Meta Global (Fallback):** Na ausência de meta específica, utiliza-se **46.53 horas**.
*   **Sinalização:** Veículos acima desses valores são rotulados como **"Acima da Meta"**.

---

## 4. Sincronização e Refresh

*   **Lookback de 2 Dias:** Sincronizações incrementais devem sempre revisar os últimos 2 dias para capturar carimbos de saída retroativos.
*   **Estratégia Híbrida:** O Dashboard principal consome dados de longo prazo do SQLite local e dados de tempo real (Delta) do Athena.

---
> [!IMPORTANT]
> Qualquer nova query SQL ou componente de visualização deve respeitar estritamente a janela **Emissão -> Saída** para o Ciclo Total.
