---
name: pac-mission-control-engine
description: Standards and patterns for the PAC Mission Control dashboard, including Athena SQL, deduplication, and city normalization.
---

# PAC Mission Control Engine Skill

This skill documents the core technical patterns, architecture, and business logic used in the PAC Mission Control dashboard for Rumo SLog.

## Core SQL Patterns (Athena)

### 1. Unified Deduplication Logic
To ensure data consistency across all views (Forecast, RCA, Export), always use the `row_number()` deduplication pattern over `gmo_id`.

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
    WHERE terminal = 'TRO'
),
dedupped AS (
    SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY gmo_id ORDER BY ts_ult DESC) as rn FROM raw_data) WHERE rn = 1
)
SELECT * FROM dedupped WHERE rn = 1
```

### 2. City & Origin Normalization
Use the `sqlNormalizeExpr` pattern to match city names from Excel files with the database names.

```sql
trim(regexp_replace(
    regexp_replace(
        translate(upper(origem_col), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'),
        '[^A-Z0-9 ]', ' '
    ), 
    '\\s+', ' '
))
```

### 3. Metric Calculations
Standardized breakdown for cycle times:
- `Ciclo Total`: `dt_peso_saida` - `dt_emissao`
- `Espera Agendamento`: `dt_agendamento` - `dt_emissao`
- `Tempo Viagem`: `dt_chegada` - `dt_agendamento`
- `Operação Terminal`: `dt_peso_saida` - `dt_chegada`
- `Área Verde`: `dt_chamada` - `dt_cheguei` (if applicable)

## Frontend Standards

### 1. Styling
- Use **Tailwind CSS**.
- Theme: Dark mode (`bg-[#010b1a]`), premium aesthetics with glassmorphism and subtle gradients (`bg-linear-to-r`).
- Rounded corners: Use `rounded-4xl` for large cards.

### 2. Charts (Chart.js)
- Use `chart.js` with `react-chartjs-2`.
- Standardized colors:
    - Operation: `#10b981` (Emerald)
    - Travel: `#0ea5e9` (Sky)
    - Wait: `#f59e0b` (Amber) / `#64748b` (Slate)
    - Pareto Bars: `#3b82f6` (Blue)

### 3. Data Export
- Use `xlsx` library.
- Always include raw timestamps and calculated metrics in hours.
- Columns should be consistent with the "Hourly Diagnostics" report.

## Directory Structure
- `src/app/api/pac/*`: Athena-backed REST API endpoints.
- `src/lib/athena.ts`: AWS SDK configuration and query executor.
- `src/lib/athena-sql.ts`: Shared SQL helpers and CTES.
- `src/lib/pracas.ts`: City mapping and normalization logic.
- `src/data/pracas_municipios.xlsx`: Source of truth for Praça mapping.

## Known Challenges
- **AWS SSO Expiration**: When queries fail with `CredentialsProviderError`, the user must run `aws sso login --profile rumo-sso`.
- **Ghost Vehicles**: Fila Externa may contain outliers (~48h+); filters are often applied to hide these from Forecast views.
