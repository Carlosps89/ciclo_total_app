import { NextResponse } from 'next/server';
import { runQuery, ATHENA_VIEW, ATHENA_DATABASE } from '@/lib/athena';
import { getCleanMap } from '@/lib/athena-sql';
import { getCached, setCached } from '@/lib/cache';
import { ResultSet } from '@aws-sdk/client-athena';

const CACHE_TTL: number = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams }: URL = new URL(request.url);
    const terminal: string = searchParams.get('terminal') || 'TRO';
    const cacheKey: string = `pac_produtos_v1_${terminal}`;

    // Check Cache
    const cachedData: unknown = getCached(cacheKey);
    if (cachedData) return NextResponse.json(cachedData);

    // Build schema map
    const map: Record<string, string> = await runQuery(`SELECT * FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}" LIMIT 0`)
      .then((res: ResultSet | undefined) => res?.ResultSetMetadata?.ColumnInfo?.map(c => c.Name).filter((n): n is string => !!n) || [])
      .then((cols: string[]) => getCleanMap(cols));

    const query: string = `
      SELECT DISTINCT ${map.produto} as produto
      FROM "${ATHENA_DATABASE}"."${ATHENA_VIEW}"
      WHERE ${map.terminal} = '${terminal}'
        AND ${map.produto} IS NOT NULL
        AND ${map.produto} != ''
        AND try_cast(${map.dt_peso_saida} as timestamp) > date_add('month', -3, current_timestamp)
      ORDER BY 1
    `;

    const results: ResultSet | undefined = await runQuery(query);
    interface AthenaRow {
        Data?: { VarCharValue?: string }[];
    }
    const rows: AthenaRow[] = (results?.Rows?.slice(1) || []) as AthenaRow[];

    const produtos: string[] = rows
      .map((r: AthenaRow) => r.Data?.[0]?.VarCharValue || '')
      .filter((p: string) => p !== '');

    const response = {
      terminal,
      updated_at: new Date().toISOString(),
      items: produtos
    };

    setCached(cacheKey, response, CACHE_TTL);
    return NextResponse.json(response);

  } catch (error) {
    console.error("Products API Error:", error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}
