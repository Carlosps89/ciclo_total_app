---
name: ciclo-rodoviario
description: Especificação definitiva das regras de negócio, benchmarks P25 e lógica de integridade de dados do Ciclo Rodoviário (PAC Mission Control).
---

# 🚀 Regras de Negócio: Ciclo Rodoviário (PAC Mission Control)

Este documento consolidado serve como a fonte da verdade para o cálculo, monitoramento e auditoria do ciclo de vida dos caminhões no ecossistema PAC Rumo.

## 1. Mapeamento de Etapas (Timestamps)

A jornada do veículo é dividida em carimbos temporais sequenciais:

| Etapa | Timestamp Base | Descrição |
| :--- | :--- | :--- |
| **1. Emissão** | `dt_emissao` | Registro da NF/Pedido na origem. |
| **2. Agendamento** | `dt_agendamento` | Reserva do slot no terminal. |
| **3. Janela** | `janela_agendamento` | Horário alvo para chegada. |
| **4. Fila Externa** | `dt_cheguei` | Check-in remoto (Bolsão/Cidade). |
| **5. Trânsito** | `dt_chamada` | Acionamento para deslocamento à portaria. |
| **6. Terminal** | `dt_chegada` | Entrada física (Cancela). |
| **7. Saída** | `dt_peso_saida` | Pesagem final e liberação. |

---

## 2. Memória de Cálculo (True Cycle)

O ciclo total não é apenas o tempo de pátio, mas o **atrito logístico total** acumulado.

### 2.1 Fórmulas Matemáticas
- **Aguardando Agendamento (Fila):** `dt_agendamento - dt_emissao`.
- **Trânsito Externo (Viagem):** `dt_chegada - dt_agendamento`.
- **Operação Terminal (Ciclo Interno):** `dt_peso_saida - dt_chegada`.
- **Ciclo Total Real:** `dt_peso_saida - dt_emissao`.

> [!IMPORTANT]
> Sempre calcule tempos em **horas decimais**: `date_diff('second', t1, t2) / 3600.0`.

---

## 3. Benchmarks Operacionais (Metas P25)

Os valores de referência (Benchmarks) utilizados para classificar veículos como **"Acima da Meta"** são baseados no P25 histórico:

* **Fila Externa (Verde):** 2.0 horas
* **Trânsito Externo:** 0.5 horas (30 minutos)
* **Operação Terminal (Interno):** 4.0 horas

---

## 4. Integridade de Dados e Limpeza (Anti-Ghosting)

Para evitar que dados sujos ou veículos "travados" poluam o dashboard:

### 4.1 Remoção de "Fantasmas" (Ghosts)
- **Timebox de 3 Dias:** Veículos com último evento há mais de 3 dias são ignorados no Forecast.
- **Trava de Fila:** Veículos em `Fila Externa` (cheguei) sem `Chamada` há mais de **48 horas** são considerados erros operacionais e removidos da visão atual.

### 4.2 Sincronização Incremental
- **Lookback de 2 Dias:** Toda carga incremental deve sobrescrever os últimos 2 dias de dados para capturar atualizações retroativas de status (ex: um caminhão que saiu mas o sistema só processou o evento horas depois).

---

## 5. Tom de Voz e Reporting (PAC Insight)

Ao comunicar resultados via WhatsApp (Bot) ou Relatórios:

- **Terminologia:** NUNCA utilize "Atrasado" ou "Fora do Padrão". Utilize sempre **"Acima da Meta"**.
- **Foco em Ofensores:** Destaque Placas e Origens que representam o maior impacto no `True Cycle`.
- **Cenário Atual (D):** Reflete a média dos veículos que completaram etapas HOJE na base local SQLite/Athena.

---

> [!TIP]
> Use esta skill para orientar a criação de Queries SQL e componentes de visualização, garantindo que a lógica de "True Cycle" seja respeitada em todos os módulos.
