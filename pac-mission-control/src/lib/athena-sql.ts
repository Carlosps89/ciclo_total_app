import { mapColumns, ATHENA_DATABASE, ATHENA_VIEW } from './athena';

export interface DateRangeOptions {
  start?: string | null;
  end?: string | null;
  range?: string | null;
}

export const COMMON_CTES = (
  map: Record<string, string>, 
  terminal: string, 
  extraFilters: string = '',
  dateOptions?: DateRangeOptions | null
): string => {
  // Determine if this is a historical query that falls outside the short cache or specifically requests range/dateOption
  const isHistoricalQuery = dateOptions && (dateOptions.start || dateOptions.range === 'month' || dateOptions.range === 'year' || dateOptions.range === 'week');
  const targetView = (ATHENA_VIEW === 'pac_clean_data' && isHistoricalQuery) ? 'vw_ciclo' : ATHENA_VIEW;
  const isCleanData = targetView === 'pac_clean_data';
  
  // Decide what to use for ts_ult (controlling column for deduplication)
  const tsUltColumn = isCleanData ? (map.ts_ult || 'ts_ult') : `greatest(
        coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
        coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
      )`;

  let dtFilter = '';
  if (isCleanData) {
      if (dateOptions?.start && dateOptions?.end) {
          dtFilter = `AND (dt = 'ACTIVE' OR (
              dt >= format_datetime(date_add('day', -10, date '${dateOptions.start}'), 'yyyy-MM-dd')
              AND dt <= format_datetime(date_add('day', 2, date '${dateOptions.end}'), 'yyyy-MM-dd')
          ))`;
      } else if (dateOptions?.range) {
          if (dateOptions.range === 'month') {
              dtFilter = `AND (dt = 'ACTIVE' OR dt >= format_datetime(date_add('day', -10, date_trunc('month', current_date)), 'yyyy-MM-dd'))`;
          } else if (dateOptions.range === 'year') {
              dtFilter = `AND (dt = 'ACTIVE' OR dt >= format_datetime(date_add('day', -10, date_trunc('year', current_date)), 'yyyy-MM-dd'))`;
          } else if (dateOptions.range === 'week') {
              dtFilter = `AND (dt = 'ACTIVE' OR dt >= format_datetime(date_add('day', -10, current_date), 'yyyy-MM-dd'))`;
          } else {
              // today or fallback
              dtFilter = `AND dt IN ('ACTIVE', 
                  format_datetime(date_add('day', -1, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
                  format_datetime(date_add('day', -2, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
                  format_datetime(date_add('day', -3, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
                  format_datetime(date_add('day', -4, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
                  format_datetime(date_add('day', -5, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
                  format_datetime(date_add('day', -6, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
                  format_datetime(current_timestamp AT TIME ZONE 'America/Sao_Paulo', 'yyyy-MM-dd')
              )`;
          }
      } else {
          dtFilter = `AND dt IN ('ACTIVE', 
              format_datetime(date_add('day', -1, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -2, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -3, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -4, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -5, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
              format_datetime(date_add('day', -6, current_timestamp AT TIME ZONE 'America/Sao_Paulo'), 'yyyy-MM-dd'),
              format_datetime(current_timestamp AT TIME ZONE 'America/Sao_Paulo', 'yyyy-MM-dd')
          )`;
      }
  }

  // Always deduplicate across partitions to handle transition from 'ACTIVE' to daily dates
  const deduppedLogic = `
      SELECT *
      FROM (
        SELECT 
          *,
          row_number() OVER (PARTITION BY _col_id ORDER BY ts_ult DESC) as rn
        FROM raw_data
      )
      WHERE rn = 1
    `;

  return `
  WITH raw_data AS (
    SELECT 
      ${map.id} as _col_id,
      ${map.terminal} as _col_terminal,
      ${map.placa} as _col_placa,
      ${map.origem} as _col_origem,
      ${map.dt_emissao} as _col_emissao,
      ${map.dt_agendamento} as _col_agendamento,
      ${map.dt_chegada} as _col_chegada,
      ${map.dt_peso_saida} as _col_peso_saida,
      ${map.dt_chamada} as _col_chamada,
      ${map.dt_cheguei} as _col_cheguei,
      ${map.janela_agendamento} as _col_janela,
      ${map.evento} as _col_evento,
      ${map.situacao} as _col_situacao,
      ${map.produto} as _col_produto,
      ${map.cliente} as _col_cliente,
      ano, mes, dia,
      ${tsUltColumn} as ts_ult
    FROM "${ATHENA_DATABASE}"."${targetView}"
    WHERE ${map.terminal} = '${terminal}'
      AND ${map.movimento} != 'CARGA'
    ${dtFilter}
    ${extraFilters}
  ),
  dedupped AS (
    ${deduppedLogic}
  ),
  calc AS (
    SELECT
      _col_id as gmo_id,
      _col_placa as placa_tracao,
      _col_origem as origem,
      _col_terminal as terminal,
      try_cast(_col_peso_saida as timestamp) as peso_saida,
      try_cast(_col_cheguei as timestamp) as cheguei,
      try_cast(_col_janela as timestamp) as janela_agendamento,
      try_cast(_col_agendamento as timestamp) as dt_agendamento,
      try_cast(_col_emissao as timestamp) as dt_emissao,
      try_cast(_col_chegada as timestamp) as dt_chegada,
      try_cast(_col_chamada as timestamp) as dt_chamada,
      
      -- Metrics
      date_diff('second', try_cast(_col_emissao as timestamp), try_cast(_col_peso_saida as timestamp)) / 3600.0 as ciclo_total_h,
      date_diff('second', try_cast(_col_emissao as timestamp), try_cast(_col_agendamento as timestamp)) / 3600.0 as aguardando_agendamento_h,
      date_diff('second', try_cast(_col_agendamento as timestamp), try_cast(_col_chegada as timestamp)) / 3600.0 as tempo_viagem_h,
      date_diff('second', try_cast(_col_chegada as timestamp), try_cast(_col_peso_saida as timestamp)) / 3600.0 as tempo_interno_h,
      
      date_diff('second', try_cast(_col_cheguei as timestamp), try_cast(_col_chamada as timestamp)) / 3600.0 as area_verde_cheguei_h,
      date_diff('second', try_cast(_col_chegada as timestamp), try_cast(_col_chamada as timestamp)) / 3600.0 as transito_para_terminal_h,
      date_diff('second', try_cast(_col_cheguei as timestamp), try_cast(_col_janela as timestamp)) / 3600.0 as antecipacao_h,
      
      CASE WHEN try_cast(_col_cheguei as timestamp) < try_cast(_col_janela as timestamp) THEN 1 ELSE 0 END as is_antecipado,
      CASE WHEN _col_cheguei IS NOT NULL AND _col_chamada IS NOT NULL THEN 'Sim' ELSE 'Não' END as is_area_verde,

      _col_evento as evento_descricao,
      _col_situacao as situacao_descricao,
      _col_produto as produto,
      _col_cliente as cliente,
      ts_ult,
      ano, mes, dia
      
    FROM dedupped
  )
  `;
};

// Helper to extract clean column mapping
export function getCleanMap(columns: string[]): Record<string, string> {
  const rawMap = mapColumns(columns);
  const find = (keywords: string[]): string | undefined => {
    const lowerCols = columns.map(c => c.toLowerCase());
    for (const k of keywords) {
      const idx = lowerCols.indexOf(k.toLowerCase());
      if (idx !== -1) return columns[idx];
    }
    return columns.find(c => keywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
  };

  return {
    ...rawMap,
    dt_chamada: find(['chamada']) || 'chamada',
    dt_chegada: find(['chegada', 'checkin']) || find(['cheguei']) || 'chegada',
    dt_cheguei: find(['cheguei', 'chegou']) || 'cheguei',
    dt_janela: find(['janela', 'window']) || 'janela_agendamento',
    placa: find(['placa', 'tracao']) || 'placa_tracao',
    janela_agendamento: find(['janela', 'window']) || 'janela_agendamento',
    movimento: find(['movimento', 'operacao']) || 'movimento',
    evento: find(['evento', 'event', 'desc', 'ds_evento']) || 'evento',
    situacao: find(['situacao', 'status', 'ds_situacao']) || 'situacao',
    produto: find(['produto', 'mercadoria', 'material']) || 'produto',
    ts_ult: find(['ts_ult', 'dh_inclusao', 'updated_at']) || 'ts_ult',
    
    gmo_id: rawMap.id || find(['gmo_id', 'id']) || 'gmo_id',
    placa_cavalo: find(['placa', 'tracao']) || 'placa_tracao',
    cliente: rawMap.cliente || find(['cliente']) || 'cliente'
  };
}
