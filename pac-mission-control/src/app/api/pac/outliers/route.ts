import { NextResponse } from 'next/server';
import { runQuery, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { applyPracaFilter } from '@/lib/pracas';
import { ResultSet } from '@aws-sdk/client-athena';

const CACHE_TTL: number = 60 * 1000;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const produto: string | null = searchParams.get('produto');
    const praca: string | null = searchParams.get('praca');
    const type: string = searchParams.get('type') || 'bad'; // 'bad' or 'good'
    const cacheKey: string = `pac_outliers_${terminal}_${produto || 'all'}_${praca || 'all'}_${type}_v4`;

    // Check Cache
    const cachedData: unknown = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    // Switch to VW_Ciclo for data consistency
    const TARGET_VIEW: string = 'VW_Ciclo';

    // Build schema map for VW_Ciclo
    const map: Record<string, string> = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [])
      .then((cols: string[]) => getCleanMap(cols));

    const produtoFilterRaw = produto ? `AND ${map.produto} = '${produto}'` : '';
    
    const pracaFilterRaw = applyPracaFilter(terminal, praca, `base.${map.origem}`, true);
    if (pracaFilterRaw.isNoMatch) {
        return NextResponse.json({
            terminal,
            updated_at: new Date().toISOString(),
            items: [],
            debug_praca_warning: pracaFilterRaw.warning
        });
    }

    const raw_cols: string = `
        ${map.id} as _col_id,
        ${map.terminal} as _col_terminal,
        ${map.placa} as _col_placa,
        ${map.origem} as _col_origem,
        ${map.produto} as _col_produto,
        ${map.dt_emissao} as _col_emissao,
        ${map.dt_agendamento} as _col_agendamento,
        ${map.janela_agendamento} as _col_janela,
        ${map.dt_cheguei} as _col_cheguei,
        ${map.dt_chamada} as _col_chamada,
        ${map.dt_chegada} as _col_chegada,
        ${map.dt_peso_saida} as _col_peso_saida,
        greatest(
            coalesce(try_cast(${map.dt_peso_saida} as timestamp), timestamp '1900-01-01 00:00:00'), 
            coalesce(try_cast(${map.dt_cheguei} as timestamp), timestamp '1900-01-01 00:00:00')
        ) as ts_ult
    `;

    const sortDir = type === 'good' ? 'ASC' : 'DESC';
    const minThreshold = type === 'good' ? '0.1' : '2';

    const query: string = `
      ${pracaFilterRaw.cte}
      ${pracaFilterRaw.cte ? ',' : 'WITH'} raw_data AS (
          SELECT ${raw_cols}
          FROM "${ATHENA_DATABASE}"."${TARGET_VIEW}" base
          ${pracaFilterRaw.join}
          WHERE base.${map.terminal} = '${terminal}'
            ${produtoFilterRaw.replace(map.produto, `base.${map.produto}`)}
      ),
      dedupped AS (
          SELECT * FROM (
              SELECT *, row_number() OVER (PARTITION BY _col_id ORDER BY ts_ult DESC) as rn
              FROM raw_data
          ) WHERE rn = 1
      ),
      calc AS (
          SELECT
              _col_id as gmo_id,
              _col_placa as placa_tracao,
              _col_origem as origem,
              _col_produto as produto,
              _col_terminal as terminal,
              try_cast(_col_peso_saida as timestamp) as peso_saida,
              try_cast(_col_cheguei as timestamp) as cheguei,
              try_cast(_col_chamada as timestamp) as dt_chamada,
              try_cast(_col_emissao as timestamp) as dt_emissao,
              try_cast(_col_agendamento as timestamp) as dt_agendamento,
              try_cast(_col_janela as timestamp) as dt_janela,
              try_cast(_col_chegada as timestamp) as dt_chegada,

              -- Wait: Emissao (Origin) -> Agendamento (Appointment)
              date_diff('second', try_cast(_col_emissao as timestamp), try_cast(_col_agendamento as timestamp)) / 3600.0 as aguardando_agendamento_h,
              
              -- Travel: Agendamento (Appointment) -> Chegada (Gate Arrival)
              date_diff('second', try_cast(_col_agendamento as timestamp), try_cast(_col_chegada as timestamp)) / 3600.0 as tempo_viagem_h,
              
              -- Internal: Chegada (Gate Arrival) -> Peso Saida (Exit)
              date_diff('second', try_cast(_col_chegada as timestamp), try_cast(_col_peso_saida as timestamp)) / 3600.0 as tempo_interno_h,

              -- Total Cycle: Emissao -> Peso Saida
              date_diff('second', try_cast(_col_emissao as timestamp), try_cast(_col_peso_saida as timestamp)) / 3600.0 as ciclo_total_h

          FROM dedupped
      )
      SELECT 
        c.gmo_id,
        c.placa_tracao,
        c.origem,
        c.produto,
        c.terminal,
        
        CASE 
          WHEN c.tempo_interno_h >= c.tempo_viagem_h AND c.tempo_interno_h >= c.aguardando_agendamento_h THEN 'Tempo Interno'
          WHEN c.tempo_viagem_h >= c.tempo_interno_h AND c.tempo_viagem_h >= c.aguardando_agendamento_h THEN 'Tempo de Viagem'
          ELSE 'Aguardando Agendamento'
        END as stage,
        
        c.ciclo_total_h as total_val_h,

        c.aguardando_agendamento_h,
        c.tempo_viagem_h,
        c.tempo_interno_h,

        c.dt_emissao,
        c.dt_agendamento,
        c.dt_janela,
        c.cheguei as dt_cheguei,
        c.dt_chamada,
        c.dt_chegada,
        c.peso_saida as dt_peso_saida
        
      FROM calc c
      WHERE c.peso_saida > date_add('day', -1, now())
      AND c.ciclo_total_h > ${minThreshold} 
      ORDER BY total_val_h ${sortDir}
      LIMIT 25
    `;


    const results: ResultSet | undefined = await runQuery(query);
    interface AthenaRow {
        Data?: { VarCharValue?: string }[];
    }
    const rows: AthenaRow[] = (results?.Rows?.slice(1) || []) as AthenaRow[];

    interface OutlierItem {
      gmo_id: string;
      placa: string;
      origem: string;
      produto: string;
      terminal: string;
      etapa: string;
      valor_h: number;
      updated_at: string;
      dt_emissao?: string;
      dt_agendamento?: string;
      dt_janela?: string;
      dt_cheguei?: string;
      dt_chamada?: string;
      dt_chegada?: string;
      dt_peso_saida?: string;
      h_agendamento: number;
      h_viagem: number;
      h_interno: number;
    }

    const items: OutlierItem[] = rows.map((r: AthenaRow): OutlierItem => {
      const d: { VarCharValue?: string }[] = r.Data || [];
      return {
        gmo_id: d[0]?.VarCharValue || '?',
        placa: d[1]?.VarCharValue || '?',
        origem: d[2]?.VarCharValue || '?',
        produto: d[3]?.VarCharValue || '?',
        terminal: d[4]?.VarCharValue || '?',
        etapa: d[5]?.VarCharValue || '?',
        valor_h: parseFloat(d[6]?.VarCharValue || '0'),
        updated_at: new Date().toISOString(),
        h_agendamento: parseFloat(d[7]?.VarCharValue || '0'),
        h_viagem: parseFloat(d[8]?.VarCharValue || '0'),
        h_interno: parseFloat(d[9]?.VarCharValue || '0'),
        dt_emissao: d[10]?.VarCharValue,
        dt_agendamento: d[11]?.VarCharValue,
        dt_janela: d[12]?.VarCharValue,
        dt_cheguei: d[13]?.VarCharValue,
        dt_chamada: d[14]?.VarCharValue,
        dt_chegada: d[15]?.VarCharValue,
        dt_peso_saida: d[16]?.VarCharValue
      };
    });

    const response = {
      terminal,
      updated_at: new Date().toISOString(),
      items
    };

    setCached(cacheKey, response, CACHE_TTL);
    return NextResponse.json(response);

  } catch (error) {
    console.error("Outliers API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch outliers' }, { status: 500 });
  }
}
