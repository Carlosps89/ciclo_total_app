import { NextRequest } from "next/server";
import { runQuery } from "@/lib/athena"; 
import { getCached, setCached } from "@/lib/cache";

type DrillItem = {
  gmo_id: string;
  placa: string;
  origem?: string | null;
  window: string; // janela_agendamento full string
  evento?: string | null;
};

// Force dynamic to properly handle request params
export const dynamic = 'force-dynamic';

function normalizeHourInput(raw: string): string | null {
  // Aceita: "YYYY-MM-DD HH:00:00" | "YYYY-MM-DDTHH:00:00" | "YYYY-MM-DD HH:00" | "YYYY-MM-DDTHH:00"
  // Retorna: "YYYY-MM-DD HH:00:00"
  const s = (raw || "").trim();
  if (!s) return null;

  // troca T por espaço, remove milissegundos se existir
  const t = s.replace("T", " ").split(".")[0];

  // Regex flexível
  // 2026-02-13 04:00:00
  // 2026-02-13 04:00
  const m = t.match(/^(\d{4}-\d{2}-\d{2})\s(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;

  const date = m[1];
  const hh = m[2];
  // força bucket hora: mm/ss -> 00
  return `${date} ${hh}:00:00`;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const terminal = (sp.get("terminal") || "").trim();
  const hourRaw = sp.get("hour") || "";

  if (!terminal) {
    return Response.json(
      { error: "missing_terminal", message: "Param 'terminal' é obrigatório." },
      { status: 400 }
    );
  }

  const hourNorm = normalizeHourInput(hourRaw);
  if (!hourNorm) {
    return Response.json(
      {
        error: "invalid_hour",
        message:
          "Param 'hour' inválido. Use 'YYYY-MM-DD HH:00:00' (ou ISO 'YYYY-MM-DDTHH:00:00').",
        received: hourRaw,
      },
      { status: 400 }
    );
  }

  const cacheKey = `pac_forecast_drilldown_v2_${terminal}_${hourNorm}`;
  const cachedData = getCached(cacheKey);
  if (cachedData) return Response.json(cachedData);

  // Construção segura (sem undefined)
  const startIso = hourNorm.replace(" ", "T"); // from_iso8601_timestamp
  
  // Create safe interpolated query manually
  // Note: Athena requires single quotes for string literals.
  const sql = `
    WITH base AS (
      SELECT DISTINCT
        CAST(gmo_id AS varchar) AS gmo_id,
        CAST(placa_tracao AS varchar) AS placa,
        CAST(origem AS varchar) AS origem,
        try_cast(janela_agendamento AS timestamp) AS janela,
        CAST(evento AS varchar) AS evento
      FROM "db_gmo_trusted"."vw_ciclo"
      WHERE terminal = '${terminal}'
        AND try_cast(janela_agendamento AS timestamp) >= from_iso8601_timestamp('${startIso}')
        AND try_cast(janela_agendamento AS timestamp) < date_add('hour', 1, from_iso8601_timestamp('${startIso}'))
    )
    SELECT
      gmo_id,
      placa,
      origem,
      format_datetime(janela, 'yyyy-MM-dd HH:mm:ss') AS window,
      evento
    FROM base
    ORDER BY window, placa
    LIMIT 500
  `;

  try {
    // runQuery without params as it seems not supported or buggy
    const result = await runQuery(sql);
    
    let mappedRows: any[] = [];
    if (result && result.Rows && result.Rows.length > 1) {
        const headers = result.Rows[0].Data.map((d: any) => d.VarCharValue);
        mappedRows = result.Rows.slice(1).map((row: any) => {
            const obj: any = {};
            row.Data.forEach((datum: any, i: number) => {
                const key = headers[i];
                obj[key] = datum.VarCharValue;
            });
            return obj;
        });
    }

    const items: DrillItem[] = mappedRows.map((r: any) => ({
      gmo_id: String(r.gmo_id ?? ""),
      placa: String(r.placa ?? ""),
      origem: r.origem != null ? String(r.origem) : null,
      window: String(r.window ?? hourNorm),
      evento: r.evento != null ? String(r.evento) : null,
    }));

    // ✅ Importante: mesmo vazio, retorna 200
    const response = {
      terminal,
      hour: hourNorm,
      count: items.length,
      rows: items,
    };
    
    setCached(cacheKey, response);
    return Response.json(response, { status: 200 });
  } catch (err: any) {
    console.error("[forecast.drilldown] Error", {
      terminal,
      hour: hourNorm,
      hourRaw,
      message: err?.message,
    });

    return Response.json(
      {
        error: "query_failed",
        message: err?.message || "Athena query failed",
        terminal,
        hour: hourNorm,
      },
      { status: 500 }
    );
  }
}
