---
name: pac-business-rules
description: Especificação detalhada e definitiva de todas as regras de negócio do Ciclo Rodoviário (PAC Mission Control). Inclui fluxo de status, memórias de cálculo do "True Cycle", lógica de antecipações (Histograma 24h), heatmaps e filtros de exceção.
---

# 🚚 Base de Conhecimento e Regras de Negócio: PAC Mission Control (Ciclo Rodoviário Completo)

Este documento é a **Bíblia Operacional** do projeto **PAC Mission Control**. Ele descreve detalhadamente a lógica de negócio, os eventos temporais, as memórias de cálculo do Ciclo Total (True Cycle), as regras de Antecipação (Histograma) e os filtros operacionais utilizados no painel para o monitoramento de caminhões de grãos (Soja, Milho, Farelo, etc.) da Rumo SLog, com foco no Terminal de Rondonópolis (TRO).

Se você é um LLM auxiliando neste projeto, **use estas regras como fonte inquestionável da verdade** antes de escrever queries AWS Athena ou componentes React.

---

## 1. Etapas e Eventos do Ciclo (Carimbos de Tempo / Timestamps)

A jornada de um caminhão logístico é registrada no banco de dados (geralmente `vw_ciclo_v2`) através de uma sequência de carimbos de tempo. A ordem cronológica do **"Caminho Feliz"** é:

1. **`dt_emissao`**: Data de emissão da Nota Fiscal / Pedido da viagem na origem.
2. **`dt_agendamento`**: Momento em que a transportadora reservou o slot no terminal.
3. **`janela_agendamento`**: Horário limite planejado (target) para o caminhão chegar no terminal.
4. **`dt_cheguei`**: Check-in remoto via App (quando o motorista sinaliza que chegou na cidade/bolsão e entra na **Fila Externa / Aguardando Agendamento**).
5. **`dt_chamada`**: Quando o terminal aciona o motorista para se dirigir fisicamente à portaria (inicia o **Tempo de Viagem / Trânsito**).
6. **`dt_chegada`**: Passagem física na cancela/portaria do terminal (Início do **Ciclo Interno / Operação Terminal**).
7. **`dt_peso_saida`**: Pesagem final, emissão do ticket e liberação de saída. Fim do ciclo lógico do caminhão no terminal.

*Nota de Deduplicação Athena:* Sempre busque o evento mais recente particionando por `id` (ou `gmo_id`) e ordenando pela maior data entre as colunas acima (`ts_ult`).

---

## 2. Memória de Cálculo: O "True Cycle" (Ciclo Total Verdadeiro)

O **Ciclo Total** de um veículo não é apenas o tempo que ele gasta dentro do porto. Ele é a soma de toda a sua jornada de atrito logístico desde que ele foi agendado.

### 2.1 Matemática das Etapas Individuais
As etapas do fluxo logístico são medidas pela diferença em horas decimais entre os carimbos. A função padrão no Athena é: 
`date_diff('second', timestamp_inicial, timestamp_final) / 3600.0`

* **Etapa 1: Aguardando Agendamento (Fila):** 
  `dt_emissao` ATÉ `dt_agendamento`
* **Etapa 2: Tempo de Viagem (Trânsito Externo):** 
  `dt_agendamento` ATÉ `dt_chegada`.
* **Etapa 3: Ciclo Interno (Operação Terminal):** 
  `dt_chegada` ATÉ `dt_peso_saida`.

### 2.2 Cálculo do Ciclo Total Agregado (Impacto Total)
O Ciclo Total real (`ciclo_h` ou `valor_h`) que deve ser exibido nos modais de detalhe e nas médias das barras do Histograma **DEVE OBRIGATORIAMENTE SER A SOMA DAS ETAPAS ACIMA**, representando a jornada de ponta a ponta:

`True Cycle Total = (Tempo Aguardando Agendamento) + (Tempo de Viagem) + (Ciclo Interno)`

No SQL, a fórmula crua do `ciclo_total_h` de ponta a ponta é calculada como:
`date_diff('second', dt_emissao, coalesce(peso_saida, current_timestamp)) / 3600.0`
*Regra de Ouro:* O ciclo começa na **Emissão** da NF e termina no **Peso de Saída**.

---

## 3. Regras de Antecipação (O Histograma de 24 horas)

Caminhões que chegam em Rondonópolis (ou outro terminal) antes do seu horário agendado geram caos na "Área Verde" (Bolsões de Estacionamento). O painel monitora isso rigorosamente.

### 3.1 Definição de Antecipação
Um veículo é considerado antecipado (`is_early = 1`) se: `dt_cheguei < janela_agendamento`.
O tempo de antecipação (`hours_early`) é: `date_diff('second', dt_cheguei, janela_agendamento) / 3600.0`.

### 3.2 O Histograma (Buckets Dinâmicos de 2h/24h)
O painel agrupa esses veículos infratores em um Gráfico de Barras com escala de 24 horas.
* **Granularidade:** Intervalos de 2 em 2 horas. 
* **Buckets Padrão:** `0-2h`, `2-4h`, `4-6h`, ..., até `22-24h`.
* **Bucket de Overflow:** Tudo que for 24 horas ou maior cai no bucket `24h+`.

### 3.3 Semantic Color Scale (Heatmap de Risco)
As barras do histograma de antecipação são coloridas via TailwindCSS (`bg-gradient-to-t`) com base no risco/agressividade da antecipação (da esquerda para a direita):
* **0h a 4h (Risco Baixo/Leve):** Tons de Azul (ex: `from-blue-600/80 to-blue-400`).
* **4h a 12h (Risco Moderado/Aviso):** Tons de Roxo/Fuchsia (ex: `from-purple-600/80 to-purple-400` ou `fuchsia-500`).
* **Acima de 12h (Risco Severo/Crítico):** Tons de Vermelho/Rose (ex: `from-red-600/80 to-rose-400`).
*(Nota: O Overflow de `24h+` deve usar tons de Vermelho extremamente escuros/bordô).*

---

## 4. Praças, Origens, Volumes e Produtos

O PAC atende gigantescos volumes agrícolas do Mato Grosso. O sistema agrupa e filtra ativamente por estas metadados:

### 4.1 Praças (Polos Logísticos do MT)
Os caminhões vêm principalmente de Origens Agregadas chamadas "Praças". As principais acompanhadas no Top Bar do app são:
* **Primavera do Leste**
* **Lucas do Rio Verde**
* **Diamantino**
* **Tapurah**
* **Alto Garças**
* **Tangará da Serra**
*(Se uma origem da NF não bater exatamente, usa-se a tabela de mapeamento de municípios para agregá-la à praça mais próxima).*

### 4.2 Produtos Atendidos
A operação é segregada pelos seguintes produtos agrícolas (`produto` column na query):
* `SOJA`
* `MILHO`
* `FARELO` (ou Farelo 48, etc).

O Frontend costuma exibir esses produtos como rótulos em caixa alta e badges estilo "Tags" (ex: no card do Drilldown de Antecipação listando Soja em um Badge Azul de destaque ao lado da Placa).

---

## 5. Módulo Drilldown e Outliers (Investigação de Causa Raiz)

Quando o usuário clica em uma barra do Histograma, ele abre o "Drilldown", que lista os caminhões específicos daquele grupo (bucket) e permite abrir o **Modal de Histórico de Impacto**.

### Regras do Modal de Veículo (OutlierItem / DrillDownItem)
1. Deve ser acionado recebendo um objeto com tipagem que contenha os tempos parciais separados (`h_agendamento`, `h_viagem`, `h_interno`), a `placa`, `gmo_id`, e o `produto`.
2. O **Impacto Total** do lado de fora E do lado de dentro do modal devem refletir estatisticamente o `True Cycle` (Soma das Etapas) descrito no tópico 2.2.
3. Se um veículo ficou `Aguardando Agendamento` por 35h e `Viajando` por 12h, o sistema o marca no rodapé como **Etapa de Maior Influência = "Aguardando Agendamento"**, culpando aquela fila como a gargalo principal.

---

## 6. Layout Flexível e Distribuição de Janelas

* **Distribuição de (D vs D+1):** O painel contrasta as chegadas registradas Hoje (D0) contra as planejadas para Amanhã (D+1). 
* **Regras de CSS (Responsividade):** Nunca crie gráficos com `height` absoluto fixo sem proteções de `min-h` ou `overflow` e `shrink-0`. O Mission Control pode ser exibido em Smart TVs verticais corporativas 4K ou em Notebooks achatados de 13 polegadas. Componentes CSS (`page.tsx`) com muitas labels (ex. 24 barrinhas) devem fluir verticalmente ou scrollar, evitando amassar o visual Glassmorphism.

---

## 7. Status Operacional Corrente (Cálculo de Fila em Tempo Real)

Para compor as tabelas de "Caminhões no Pátio Agora", avaliamos o status de trás pra frente no Athena:
```sql
CASE 
  WHEN chegada IS NOT NULL THEN 'Operação Terminal'
  WHEN chamada IS NOT NULL THEN 'Trânsito Externo'
  WHEN cheguei IS NOT NULL THEN 'Fila Externa'
  ELSE 'Programado'
END as status_operacional
```

## 8. Limpeza de Dados e Exceções Sistêmicas (Filtros de Sujeira)
1. **Cancelamentos:** Rejeite sempre (`situacao` não pode conter `%CANCEL%`).
2. **Ciclos Fechados no Forecast:** Se `dt_peso_saida` existe, o caminhão foi embora. Não deve aparecer em gráficos de "Fila Atual" nem Histogramas de "O que está acontecendo agora", a não ser em visões exclusivas do Passado (Snapshot Histórico).

> Siga estas regras categoricamente. Qualquer alteração visual, de métrica ou de query SQL do PAC deve estar em conformidade com as lógicas acima.
