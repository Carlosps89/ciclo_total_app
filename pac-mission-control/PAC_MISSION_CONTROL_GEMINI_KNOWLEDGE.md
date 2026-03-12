# 🧠 Contexto e Regras do Projeto: PAC Mission Control

**Objetivo deste documento:** Servir como base de conhecimento (prompt de contexto) para qualquer Inteligência Artificial (como o Gemini) que for auxiliar no desenvolvimento, manutenção ou análise de dados do projeto **PAC Mission Control**. Leia atentamente as regras abaixo antes de sugerir ou escrever qualquer código.

---

## 1. Visão Geral do Projeto
- **Nome:** PAC Mission Control (Painel Sinótico)
- **Propósito:** Painel de controle interativo e em tempo real para monitoramento do Ciclo Rodoviário (Caminhões/PAC) da Rumo SLog.
- **Foco:** Performance extrema de leitura (tempo de resposta < 3s) e experiência de visualização no estilo "Mission Control" (telas grandes, interface escura, visual premium).

---

## 2. Stack Tecnológico & Arquitetura
- **Frontend:** Next.js 14+ usando a estrutura **App Router** (`src/app/`).
- **Estilização:** TailwindCSS.
- **Backend (BFF):** Next.js API Routes (`src/app/api/...`) atuando como intermediário.
- **Banco de Dados (Data Source):** AWS Athena (acessado via AWS SDK v3 para JavaScript/TypeScript).
- **Cache Strategy:** Sistema de cache em memória (TTL de 60s) nas rotas da API para evitar custos excessivos de consultas recorrentes no Athena.
- **Testes:** Playwright (`@playwright/test`) para testes de interface/E2E.

---

## 3. Padrões de Frontend e UI/UX
- **Tema e Cores:** O design é obrigatoriamente **Dark Mode** (`bg-[#010b1a]`).
- **Estética "Premium":** 
  - Uso massivo de efeitos "Glassmorphism" (fundos translúcidos com blur).
  - Utilização de gradientes sutis (`bg-linear-to-r`).
  - Bordas muito arredondadas (`rounded-4xl`) para os cards principais de destaque.
- **Gráficos:** Desenvolvidos utilizando `chart.js` com a biblioteca wrapper `react-chartjs-2`.
  - **Padrão de Cores Oficial dos Gráficos:**
    - Operação (Terminal/Interno): `#10b981` (Emerald)
    - Viagem (Rodovia): `#0ea5e9` (Sky)
    - Espera (Agendamento): `#f59e0b` (Amber) ou `#64748b` (Slate)
    - Barras de Pareto: `#3b82f6` (Blue)
- **Exportação de Dados:** Feita no lado do cliente utilizando a biblioteca `xlsx`. Todo relatório exportado deve conter os *timestamps* brutos originais e também as métricas de tempo já calculadas em **horas decimais**.

---

## 4. Engenharia de Dados & Padrões SQL (AWS Athena)

O banco de dados se baseia na tabela/view `"db_gmo_trusted"."vw_ciclo_v2"`. Todo SQL gerado deve seguir as premissas abaixo.

### 4.1 Deduplicação Universal de Registros (Regra de Ouro)
Sempre deduplique os registros usando `row_number()` particionado por `gmo_id`. O critério de desempate (para pegar o evento mais recente) é obter a maior data entre vários campos de tempo, criando uma coluna virtual chamada `ts_ult`.

**Padrão de Query (Sempre usar este esqueleto):**
```sql
WITH raw_data AS (
    SELECT 
        id as gmo_id,
        ...,
        greatest(
            coalesce(try_cast(dt_peso_saida as timestamp), timestamp '1900-01-01 00:00:00'), 
            coalesce(try_cast(dt_chegada as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(dt_chamada as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(dt_cheguei as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(dt_agendamento as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(dt_emissao as timestamp), timestamp '1900-01-01 00:00:00')
        ) as ts_ult
    FROM "db_gmo_trusted"."vw_ciclo_v2"
    WHERE terminal = 'TRO' -- Sempre filtrar por Rondonópolis (referência padrão)
),
dedupped AS (
    SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn 
        FROM raw_data
    ) WHERE rn = 1
)
SELECT * FROM dedupped;
```

### 4.2 Métricas de Ciclo (Como calcular)
As etapas do fluxo logístico de um caminhão têm tempos medidos com a seguinte matemática (diferença entre datas):
1. **Ciclo Total:** `dt_peso_saida` - `dt_emissao`
2. **Espera Agendamento:** `dt_agendamento` - `dt_emissao`
3. **Tempo Viagem:** `dt_chegada` - `dt_agendamento`
4. **Operação Terminal (Tempo Interno):** `dt_peso_saida` - `dt_chegada`
5. **Área Verde (Espera Pátio, se houver):** `dt_chamada` - `dt_cheguei`
6. **Antecipação:** `dt_chegada` < `dt_inicio_janela` (Janela Início)

### 4.3 Normalização de Strings (Cidades e Origens)
Para cruzar dados de cidades (que podem vir de planilhas de Excel do usuário) com o banco de dados do Athena, é OBRIGATÓRIO usar o padrão de tratamento de string que remove acentos e caracteres especiais:
```sql
-- Expressão Athena para normalizar cidades (exemplo na coluna origem_col)
trim(regexp_replace(
    regexp_replace(
        translate(upper(origem_col), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
        '[^A-Z0-9 ]', ' '
    ), 
    '\\s+', ' '
))
```

---

## 5. Estrutura de Diretórios Crítica
- `src/app/api/pac/*`: Rotas de backend onde ficam as consultas SQL do Athena que alimentam as telas.
- `src/lib/athena.ts`: Configuração do AWS SDK e executor de queries.
- `src/lib/athena-sql.ts`: Arquivo central que contém fragmentos SQL reutilizáveis (CTEs compartilhadas, formatação de datas, fragmentos de métricas). Modificações que afetam todo lado do server ficam aqui.
- `src/lib/pracas.ts`: Lógica de mapeamento e normalização de praças (cidades).
- `src/data/pracas_municipios.xlsx`: Arquivo de Excel que é a fonte de dados (Source of Truth) da relação entre Fazendas/Praças e Cidades.
- `thresholds.json`: Arquivo na raiz do projeto onde ficam os tempos-alvo (metas) e limites para alertas Amarelo/Vermelho de cada etapa do ciclo processual.

---

## 6. Desafios Conhecidos e Casos Especiais (Edge Cases)

### 6.1 "Ghost Vehicles" (Caminhões Fantasmas)
Muitas vezes, a "Fila Externa" (caminhões a caminho) contém dados corrompidos ou abandonados com tempos irreais (ex: viagem de mais de 48h sem evolução no status). Filtros devem ser aplicados ativamente nas telas de **Forecast** para mascarar esses *Outliers* extremos.

### 6.2 Autenticação AWS (Erros de Credencial)
Erros do tipo `CredentialsProviderError` na API / interface não são bugs de código. Significa que a sessão local do SSO da AWS expirou. O engenheiro responsável deve rodar no terminal: `aws sso login --profile rumo-sso`.

---

## Conclusão / Instrução para o LLM
**A partir de agora, use todas as regras acima como base de conhecimento estrita.** 
Quando for escrever rotas SQL, utilize a deduplicação mostrada. Quando for sugerir componentes React, use classes do Tailwind para "Dark Mode e Glassmorphism" conforme detalhado. Assuma o contexto de um sistema logístico de alta performance.
