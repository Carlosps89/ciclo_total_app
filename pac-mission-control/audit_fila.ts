import { runQuery, ATHENA_DATABASE } from './src/lib/athena';
import { getCleanMap } from './src/lib/athena-sql';
import { ResultSet } from '@aws-sdk/client-athena';

async function auditFilaExterna() {
  const TARGET_VIEW = 'VW_Ciclo';
  const terminal = 'TRO';

  // 1. Get column mapping
  const rawCols = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
    .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || []);
  const map: any = getCleanMap(rawCols);

  console.log(`Auditing Fila Externa for Terminal: ${terminal}`);
  console.log(`Local Time (estimated -4h): ${new Date(Date.now() - 4 * 3600000).toISOString()}`);

  const query = `
    WITH raw_data AS (
        SELECT 
          ${map.id} as id, ${map.placa} as placa,
          ${map.dt_emissao} as em,
          ${map.dt_agendamento} as ag,
          ${map.dt_cheguei} as ch,
          ${map.dt_chamada} as cda,
          ${map.dt_chegada} as cga,
          ${map.dt_peso_saida} as ps,
          ${map.situacao || 'situacao'} as sit,
          greatest(
            coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
            coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
            coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
          ) as ts_ult
        FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}"
        WHERE ${map.terminal} = '${terminal}'
    ),
    dedup AS (
      SELECT * FROM (
        SELECT *, row_number() OVER (PARTITION BY id ORDER BY ts_ult DESC) as rn FROM raw_data
      ) WHERE rn = 1
    ),
    canceled_ids AS (
        SELECT distinct ${map.id} as cid
        FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}"
        WHERE (
          upper(coalesce(${map.situacao || 'situacao'}, '')) LIKE '%CANCEL%' OR 
          upper(coalesce(${map.evento || 'evento_descricao'}, '')) LIKE '%CANCEL%'
        )
    ),
    active AS (
      SELECT * FROM dedup
      WHERE (try_cast(ps as timestamp) IS NULL OR coalesce(cast(ps as varchar), '') = '')
        AND id NOT IN (SELECT cid FROM canceled_ids)
        AND try_cast(ch as timestamp) IS NOT NULL
        AND try_cast(cda as timestamp) IS NULL
        AND try_cast(cga as timestamp) IS NULL
    )
    SELECT 
      id, placa, em, ag, ch,
      date_add('hour', -4, now()) as local_now,
      date_diff('second', coalesce(try_cast(em as timestamp), try_cast(ag as timestamp)), date_add('hour', -4, now())) / 3600.0 as calc_acumulado_h
    FROM active
    ORDER BY calc_acumulado_h DESC
    LIMIT 5
  `;

  try {
    const res = await runQuery(query);
    console.log('\n--- FILA EXTERNA AUDIT SAMPLES ---');
    if (res?.Rows && res.Rows.length > 1) {
      const cols = res.Rows[0].Data?.map((d: any) => d.VarCharValue);
      console.log(cols?.join(' | '));
      res.Rows.slice(1).forEach((r: any) => {
        console.log(r.Data?.map((d: any) => d.VarCharValue).join(' | '));
      });
    } else {
      console.log('No active loads found in Fila Externa.');
    }
  } catch (err) {
    console.error('Audit Error:', err);
  }
}

auditFilaExterna();
