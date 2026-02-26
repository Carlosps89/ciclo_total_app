
import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/athena';

export async function GET() {
  try {
    const query = `SELECT peso_saida FROM "db_gmo_trusted"."vw_ciclo" WHERE peso_saida IS NOT NULL LIMIT 5`;
    const result = await runQuery(query);
    return NextResponse.json({ ok: true, rows: result.Rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
