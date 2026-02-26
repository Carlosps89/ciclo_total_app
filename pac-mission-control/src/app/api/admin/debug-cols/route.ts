
import { NextResponse } from 'next/server';
import { runQuery } from '@/lib/athena';

export async function GET() {
    try {
        const sql = `SELECT * FROM "db_gmo_trusted"."vw_ciclo_v2" LIMIT 1`;
        const res = await runQuery(sql);
        const cols = res?.ResultSet?.ResultSetMetadata?.ColumnInfo?.map((c: any) => c.Name).join(', ');
        return NextResponse.json({ ok: true, cols });
    } catch (error: any) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
