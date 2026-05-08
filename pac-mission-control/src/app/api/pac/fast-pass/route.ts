import { NextResponse } from 'next/server';
import { getCached, setCached } from '@/lib/cache';
import { fetchFastPassData } from '@/lib/pac-fast-pass';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const terminal = searchParams.get('terminal') || 'TRO';
        const platesParam = searchParams.get('plates');
        
        if (!platesParam) {
            return NextResponse.json({ error: 'Nenhuma placa informada' }, { status: 400 });
        }

        const plates = platesParam.split(',').map(p => p.trim().toUpperCase());

        const tzOptions = { timeZone: 'America/Sao_Paulo', year: 'numeric' as const, month: '2-digit' as const, day: '2-digit' as const };
        const todayStr = new Intl.DateTimeFormat('en-CA', tzOptions).format(new Date());
        const targetDateStr = searchParams.get('date') || todayStr;

        const cacheKey = `pac_fast_pass_${terminal}_${plates.sort().join('_')}_${targetDateStr}`;
        const cachedData = getCached(cacheKey);
        
        if (cachedData) {
            return NextResponse.json(cachedData);
        }

        const responseData = await fetchFastPassData(terminal, plates, targetDateStr);
        if (!responseData) {
            return NextResponse.json({ error: 'Nenhum dado encontrado' }, { status: 404 });
        }

        setCached(cacheKey, responseData, CACHE_TTL);

        return NextResponse.json(responseData);
    } catch (error: any) {
        console.error("Fast Pass API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
