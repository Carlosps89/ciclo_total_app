import { mapColumns } from './athena';


export const COMMON_CTES = (map: Record<string, string>, terminal: string, extraFilters: string = ''): string => `
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
      -- Calculate timestamp of last update for deduplication (Naive cast to timestamp)
      -- Priority: Peso Saida > Chegada > Chamada > Cheguei > Agendamento > Emissao
      greatest(
        coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
        coalesce(try_cast(${map.dt_chegada} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_chamada} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_agendamento} as timestamp), timestamp '1900-01-01 00:00:00'),
        coalesce(try_cast(${map.dt_emissao} as timestamp), timestamp '1900-01-01 00:00:00')
      ) as ts_ult
    FROM "db_gmo_trusted"."vw_ciclo_v2"
    WHERE ${map.terminal} = '${terminal}'
    ${extraFilters}
  ),
  dedupped AS (
    SELECT *
    FROM (
      SELECT 
        *,
        row_number() OVER (PARTITION BY _col_id ORDER BY ts_ult DESC) as rn
      FROM raw_data
    )
    WHERE rn = 1
  ),
  calc AS (
    SELECT
      _col_id as gmo_id,
      _col_placa as placa_tracao,
      _col_origem as origem,
      _col_terminal as terminal,
      -- Cast to Timestamp (Naive) for comparisons
      try_cast(_col_peso_saida as timestamp) as peso_saida,
      try_cast(_col_cheguei as timestamp) as cheguei,
      try_cast(_col_janela as timestamp) as janela_agendamento,
      try_cast(_col_agendamento as timestamp) as dt_agendamento,
      try_cast(_col_emissao as timestamp) as dt_emissao,
      try_cast(_col_chegada as timestamp) as dt_chegada,
      try_cast(_col_chamada as timestamp) as dt_chamada,
      
      -- Metrics (Hours) - DateDiff works with Naive Timestamps
      date_diff('second', try_cast(_col_emissao as timestamp), try_cast(_col_peso_saida as timestamp)) / 3600.0 as ciclo_total_h,
      date_diff('second', try_cast(_col_emissao as timestamp), try_cast(_col_agendamento as timestamp)) / 3600.0 as aguardando_agendamento_h,
      date_diff('second', try_cast(_col_agendamento as timestamp), try_cast(_col_chegada as timestamp)) / 3600.0 as tempo_viagem_h,
      date_diff('second', try_cast(_col_chegada as timestamp), try_cast(_col_peso_saida as timestamp)) / 3600.0 as tempo_interno_h,
      
      -- Secondary
      date_diff('second', try_cast(_col_cheguei as timestamp), try_cast(_col_chamada as timestamp)) / 3600.0 as area_verde_cheguei_h,
      date_diff('second', try_cast(_col_chegada as timestamp), try_cast(_col_chamada as timestamp)) / 3600.0 as transito_para_terminal_h,
      date_diff('second', try_cast(_col_cheguei as timestamp), try_cast(_col_janela as timestamp)) / 3600.0 as antecipacao_h,
      
      -- Calculated Logic for Flags (Safe)
      CASE WHEN try_cast(_col_cheguei as timestamp) < try_cast(_col_janela as timestamp) THEN 1 ELSE 0 END as is_antecipado,
      CASE WHEN _col_cheguei IS NOT NULL AND _col_chamada IS NOT NULL THEN 'Sim' ELSE 'Não' END as is_area_verde,

      -- Metadata
      _col_evento as evento_descricao,
      _col_situacao as situacao_descricao,
      _col_produto as produto,
      _col_cliente as cliente,
      ts_ult,
      ano, mes, dia
      
    FROM dedupped
  )
`;

// Helper to extract clean column mapping
export function getCleanMap(columns: string[]): Record<string, string> {
  const rawMap = mapColumns(columns);
  const find = (keywords: string[]): string | undefined => {
    const lowerCols = columns.map(c => c.toLowerCase());
    // 1. Try exact match
    for (const k of keywords) {
      const idx = lowerCols.indexOf(k.toLowerCase());
      if (idx !== -1) return columns[idx];
    }
    // 2. Try includes (substring)
    return columns.find(c => keywords.some(k => c.toLowerCase().includes(k.toLowerCase())));
  };

  return {
    ...rawMap,
    dt_chegada: find(['chegada', 'checkin']) || find(['cheguei']) || 'chegada',
    dt_cheguei: find(['cheguei', 'chegou']) || 'cheguei',
    dt_janela: find(['janela', 'window']) || 'janela_agendamento',
    placa: find(['placa', 'tracao']) || 'placa_tracao',
    janela_agendamento: find(['janela', 'window']) || 'janela_agendamento',
    evento: find(['evento', 'event', 'desc', 'ds_evento']) || 'evento',
    situacao: find(['situacao', 'status', 'ds_situacao']) || 'situacao',
    produto: find(['produto', 'mercadoria', 'material']) || 'produto',
    
    gmo_id: rawMap.id || find(['gmo_id', 'id']) || 'gmo_id',
    placa_cavalo: find(['placa', 'tracao']) || 'placa_tracao',
    cliente: rawMap.cliente || find(['cliente']) || 'cliente'
  };
}
