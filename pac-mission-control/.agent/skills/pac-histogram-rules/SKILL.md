---
name: pac-histogram-rules
description: Informações sobre como os histogramas de outliers e antecipação são construídos no PAC Mission Control e quais as possibilidades e regras envolvidas.
---

# 📊 Regras dos Histogramas (Outliers e Antecipações)

Os histogramas são a principal ferramenta visual do **PAC Mission Control** para diagnosticar o comportamento da frota na "cauda longa" (outliers) e avaliar o nível de antecipação (viagens que chegam antes da janela).

---

## 1. Funcionamento do Motor de Outliers (`outliers-engine/route.ts`)

O motor de outliers gera 5 histogramas principais que medem as infrações de tempo em cada etapa do ciclo:

1. **Emissão até Agendamento:** Foco em atrasos administrativos.
2. **Agendamento até Janela:** Avalia o *gap* de planejamento.
3. **Tempo de Viagem:** Avalia atrasos logísticos na estrada.
4. **Tempo Interno (Operação):** Avalia a ineficiência do terminal em si.
5. **Área Verde (Tempo de Espera Fila Externa):** Avalia o gargalo no bolsão.

### 1.1 Cálculo dos Limites (Thresholds IQR)
O limite do que é considerado uma anomalia (a linha "vermelha / tracejada" no gráfico) **NÃO** é fixo por padrão. Ele é calculado estatisticamente usando o método IQR (Interquartil Range):
- Acha-se o `P75` (75º percentil - Q3) dos tempos.
- Acha-se o `P25` (25º percentil - Q1) dos tempos.
- Subtrai-se para achar o IQR = `P75 - P25`.
- **Teto do Outlier:** `P75 + (1.5 * IQR)`.

**Exceções e Overrides:**
O usuário pode substituir (fazer override) manual desses tetos pelo painel ou forçar multiplicadores maiores de tolerância IQR (ex: de 1.5x para 2.0x). Se o Q3 for zero ou ausente, a API assume hardcodes de limite de fallback: Viagem (24h), Interno (12h), Verde (24h), Emissão (48h), Agendamento (72h).

### 1.2 Agrupamento Dinâmico (Baldes / Buckets)
Os histogramas processam milhares de viagens e as agrupam em "baldes" paramétricos.
O tamanho do balde (`step`) pode ser configurado dinamicamente no frontend (via *seletor Lupa: 2h, 4h, 12h, 24h, etc.*):
- `stepEmissao` e `stepAgendamento` costumam usar **24h**.
- `stepViagem` e `stepVerde` costumam usar **24h** ou **12h**.
- `stepInterno` é mais granular, usando **12h** ou até pular de hora em hora.

O SQL cria colunas agregadas matematicas. Exemplo:
```sql
cast(floor(LEAST(tempo_viagem_h, 120) / stepViagem) * stepViagem as varchar) as label
```
**Limite Visual:** Há tetos máximos (caps) exibidos, após isso agrupam tudo num balde "Mais de Xh", como: `LEAST(tempo_viagem_h, 120)` garantindo que nada estoure 120 horas visualmente, agrupando caudas extremas.

---

## 2. Antecipações e Systemic Engine (`systemic/route.ts`)

O painel Sistêmico olha mais profundamente para a relação entre as datas criadas e a Janela pactuada (`dt_janela`). Ele cruza as violações do SLA do Agendamento.

### 2.1 Hipóteses e Comportamentos (Histograms base)
Ao invés de usar uma escala matemática IQR linear contínua, o painel `systemic` agrupa os atrasos sistêmicos (Emissão > Janela, ou Agendamento > Janela) em réguas duras/fixas:
- **`0-24h`**
- **`24-48h`**
- **`48-72h`**
- **`>72h`**

### 2.2 Conceito de Antecipação
O cálculo principal da antecipação (quando o caminhão chega *antes* da janela de agendamento prometida) ocorre via:
- `janela_agendamento` - `dt_cheguei` (Positivo se chegou antes, Negativo se chegou atrasado).

---

## 3. Drill-down (Exploração Profunda)

Quando o usuário clica em uma barra espedífica do histograma no *Outlier Dashboard* (ex: clicou na barra "24h - 48h"), a tela dispara para a API de Drill-down (`outliers-drilldown/route.ts`) com os parâmetros:
- `minHours`: Início do balde clicado (ex: 24).
- `maxHours`: Fim do balde clicado (ex: 48).

**Neste drilldown ocorre:**
- Filtragem minuciosa dos `gmo_ids` limitados a essa faixa específica (`>= minHours AND < maxHours`).
- Criação de um *micro-histograma* mais refinado daquela barra, caso o usuário queira descer o nível (ex: clicando em uma barra de 24h *step* e explodindo-a em em barras de 2h dentro desse limite).
- Exibição de um *Heatmap* de Ofensores de Dia vs. Hora.
- Listagem dos Placas/Clientes responsáveis por esses outliers.

---

## 4. O que pode ser ajustado nos Histogramas? (Possibilidades para o GPT)

Se o usuário pedir para mexer nos histogramas, as possibilidades principais são:

1. **Alterar as faixas de corte (Steps):** 
   Mudar a API para aceitar passos menores. Ex: em viagens de curta distância, mudar a base de steps de 24h para passos de 2h ou 4h, refinando a matemática de agrupamento SQL (`floor(valor / step) * step`).

2. **Mexer nas Cores Base do Threshold:**
   O React (`OutliersDashboard.tsx`) colore as barras de acordo com uma condição (`isAnomaly`). Se ultrapassou o P75+IQR Limit (ou Limit Manual), a barra fica Laranja (`rgba(249, 115, 22)`), senão fica Azul (`rgba(56, 189, 248)`). Roxa quando selecionada. É fácil de customizar para esquemas monocromáticos premium.

3. **Mudar a Função de Teto (Cap Limit):**
   Limites atuais (144h para emissao, 120h viagem, 96h operação interna) estão marretados (`LEAST(..., 144)`). Podemos parametrizar isso se eles precisarem ver aberrações logísticas mais extremas no mesmo gráfico contínuo.

4. **Tratamento de Valores Negativos (Antecipação Verdadeira):**
   Hoje os histogramas de Outlier filtram `targetColumn > 0`. Valores de antecipação negativa (`dt_chegada < dt_agendamento`) não compõem a métrica IQR e ficam ocultos neste dashboard para não puxar a média pra baixo erradamente. Pode-se criar gráficos espelhados (uma barra para cima (atraso) e uma para baixo (antecipação)) no frontend no futuro.
