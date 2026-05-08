# 🎓 PAC Master Skill — Conhecimento Operacional Rumo SLog

Este documento é a fonte definitiva de verdade para o **PAC Mission Control** (Painel Sinótico de Ciclo Rodoviário). Ele detalha desde os fundamentos técnicos até as nuances mais complexas das regras de negócio.

---

## 🚀 1. Visão Geral e Arquitetura

O PAC (Painel de Acompanhamento de Ciclo) monitora em tempo real a performance dos caminhões que atendem os terminais da Rumo SLog.

### Stack Tecnológica
- **Frontend/Backend**: Next.js 14+ (App Router).
- **Dados Remotos**: AWS Athena (`db_gmo_trusted.vw_ciclo_v2` ou `pac_clean_data`).
- **Dados Locais (Cache/Histórico)**: SQLite (`pac-mission-control/data/pac_history.db`).
- **Workers**: WhatsApp Bot IA (`whatsapp-worker.ts`) que gera relatórios via Gemini.
- **Autenticação**: AWS SSO (`rumo-sso`) para acesso ao Athena.

### Fluxo de Dados
1. O robô de sincronização (`sync-data.ts`) busca dados novos no Athena periodicamente.
2. Os dados são limpos, calculados e armazenados no SQLite local.
3. O Dashboard Next.js consome APIs que consultam prioritariamente o SQLite local para performance.

---

## 📏 2. Regras de Negócio & "Regra de Ouro"

### 2.1 A "Regra de Ouro" (Deduplicação)
Registros no Athena podem ter duplicatas devido ao particionamento. **Sempre** deduplique pelo `gmo_id` (ID da viagem) ordenando pelo maior timestamp disponível (`ts_ult`).

### 2.2 Filtro de "Caminhões Fantasmas"
Viagens com **Ciclo Total > 168 horas** (7 dias) são consideradas anomalias (fantasmas) e devem ser excluídas de cálculos de médias operacionais para não inflar os indicadores.

### 2.3 Timezones
- **Armazenamento**: Todos os timestamps no banco são **UTC**.
- **Apresentação**: Devem ser convertidos para **BRT (UTC-3)** para consumo operacional.

---

## 🔄 3. Detalhamento das Etapas do Ciclo (Deep Dive)

O ciclo de vida de uma viagem PAC é dividido em 4 marcos temporais principais:

| Etapa | Início | Fim | Descrição Operacional |
| :--- | :--- | :--- | :--- |
| **Aguardando Agendamento** | `dt_emissao` | `dt_agendamento` | Tempo entre a criação do documento e a reserva de horário no terminal. |
| **Tempo de Viagem** | `dt_agendamento` | `dt_chegada` | O deslocamento físico do caminhão da origem até o pátio de triagem do terminal. |
| **Tempo Interno** | `dt_chegada` | `dt_peso_saida` | Permanência total dentro da área de influência do terminal (Pátio + Operação). |
| **Área Verde (Espera)** | `dt_cheguei` | `dt_chamada` | Tempo que o caminhão ficou parado no pátio aguardando ser chamado para carregar/descarregar. |

---

## 🧮 4. Cálculos Operacionais

As métricas são calculadas em **horas (REAL)** seguindo a fórmula:
`Diferença em segundos / 3600.0`

### Fórmulas Principais:
- **Ciclo Total**: `dt_peso_saida - dt_emissao`
- **Fila (Agendamento)**: `dt_agendamento - dt_emissao`
- **Viagem**: `dt_chegada - dt_agendamento`
- **Interno**: `dt_peso_saida - dt_chegada`
- **Antecipação**: `dt_cheguei - dt_janela_agendamento`
    - Se `dt_cheguei < dt_janela`, o caminhão está **antecipado** (chegou antes do horário).

---

## 🗄️ 5. Dicionário de Dados (SQLite)

**Arquivo Local**: `pac-mission-control/data/pac_history.db`

### Tabela: `gmo_history`
| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `gmo_id` | TEXT (PK) | ID único da viagem. |
| `terminal` | TEXT | Código da praça (TRO, PGA, CBA, RBR). |
| `ciclo_total_h` | REAL | Duração total do ciclo em horas. |
| `fila_h` | REAL | Tempo de aguardo de agendamento. |
| `viagem_h` | REAL | Tempo de viagem. |
| `interno_h` | REAL | Tempo interno no terminal. |
| `dt_inicio` | DATETIME | Timestamp de emissão. |
| `dt_peso_saida`| DATETIME | Timestamp de conclusão do ciclo. |

### Outras Tabelas:
- `plaza_targets`: Contém as metas (Thresholds) específicas por terminal.
- `operational_benchmarks`: Percentis históricos (P25) usados como meta de excelência.

---

## 🖥️ 6. Interfaces & APIs

### Telas do Dashboard
1. **Principal (/)**: Visão executiva, velocímetros de ciclo, distribuição de chegadas (24h) e alertas de outliers.
2. **Origens (/origens)**: Mapa de calor mostrando de onde vêm os caminhões e onde estão os gargalos.
3. **Histórico (/historico)**: Análise de tendências temporais (dia a dia, semana a semana).
4. **Diagnóstico (/diagnostics)**: Explicação de causas raiz para problemas de performance.
5. **Forecast (/forecast)**: Predição de volume de chegadas para as próximas horas/dias.

### APIs Chave (`/api/pac/`)
- `summary`: Resumo das últimas 24h por etapa.
- `ciclo-total`: Dados para o histograma de performance.
- `antecipacoes`: Métricas de caminhões que chegam fora da janela.
- `performance`: Cálculo em tempo real de eficiência por praça.

---

## 🛠️ 7. Skills de Manutenção

### Comandos de Administração:
- **Sincronizar Dados AGORA**: `npm run sync` (dentro de `pac-mission-control`).
- **Verificar Banco**: `sqlite3 data/pac_history.db "SELECT count(*) FROM gmo_history"`
- **Renovar Credenciais AWS**: `aws sso login --profile rumo-sso`

---

*Este documento deve ser lido integralmente pela IA antes de qualquer sugestão de alteração no código ou análise de dados.*
