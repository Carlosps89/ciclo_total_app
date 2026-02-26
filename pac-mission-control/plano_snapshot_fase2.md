# Plano de Evolução: Snapshot Por Hora (Fase 2)

Para garantir performance absoluta e reduzir custos de varredura no Athena, a Fase 2 propõe a criação de uma tabela de snapshot pré-calculada.

## 1. Tabela de Snapshot (S3/Parquet)

Criar uma tabela `pac_snapshot_hourly` particionada por data e hora.

**Schema Sugerido:**
```sql
CREATE EXTERNAL TABLE pac_snapshot_hourly (
  data_referencia date,
  hora int,
  etapa string,
  origem string,
  terminal string,
  
  -- Métricas Agregadas
  mediana_minutos double,
  p95_minutos double,
  media_minutos double,
  volume_viagens int,
  
  -- Antecipação
  volume_antecipados int,
  
  updated_at timestamp
)
PARTITIONED BY (dt string, hr string)
STORED AS PARQUET
LOCATION 's3://seu-datalake/refined/pac_snapshot_hourly/';
```

## 2. Pipeline de Atualização (EventBridge + Lambda)

1. **EventBridge Schedule**: Executar a cada hora (ex: `cron(0 * * * ? *)`).
2. **Lambda (Python/Boto3)**:
   - Dispara query `INSERT INTO pac_snapshot_hourly ... SELECT ...` no Athena.
   - A query deve agregar os dados da última hora (ou D-1 full, dependendo da regra de negócio) e salvar na partição correta.

## 3. Query de Agregação (Exemplo)

```sql
INSERT INTO pac_snapshot_hourly
SELECT 
  current_date as data_referencia,
  hour(now()) as hora,
  'Tempo de Viagem' as etapa,
  origem,
  terminal,
  approx_percentile(date_diff('minute', dt_agendamento, dt_chegada), 0.5) as mediana_minutos,
  ...
FROM db_gmo_trusted.vw_ciclo_v2
WHERE dt_chegada > date_add('hour', -1, now())
GROUP BY 1, 2, 3, 4, 5;
```

## 4. Adaptação do Backend

O endpoint `/api/pac/summary` deverá ser alterado para:
1. Tentar ler de `pac_snapshot_hourly` filtrando pela última partição disponível.
2. (Fallback) Se não houver dados recentes, executar a query "live" (modelo atual).
