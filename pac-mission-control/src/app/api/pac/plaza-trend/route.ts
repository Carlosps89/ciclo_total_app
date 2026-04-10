import { NextRequest, NextResponse } from 'next/server';
import { getPlazaTrendStats } from '@/lib/db';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const terminal = searchParams.get('terminal') || 'TRO';
        const origem = searchParams.get('origem') || undefined;

        console.log(`[API] Buscando tendência MTD para: ${origem || 'TERMINAL TOTAL'}`);
        const data = getPlazaTrendStats(terminal, origem);

        return NextResponse.json({
            success: true,
            origem: origem || 'TOTAL',
            data
        });
    } catch (e: any) {
        console.error("[API Error] Plaza Trend:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
