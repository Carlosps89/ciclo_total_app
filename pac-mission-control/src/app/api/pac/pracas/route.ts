import { NextResponse } from 'next/server';
import { getPracas, debugPracasError, debugPracasCount } from '@/lib/pracas';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const terminal = searchParams.get('terminal');

    if (!terminal) {
        return NextResponse.json({ error: 'Terminal is required' }, { status: 400 });
    }

    try {
        const pracasList = getPracas(terminal);
        // Prefix with 'TODAS'
        const result = ['TODAS', ...pracasList];

        return NextResponse.json({
            terminal: terminal.toUpperCase(),
            pracas: result,
            debug: { count: debugPracasCount, error: debugPracasError }
        });
    } catch (e) {
        console.error("[API Pracas] Error", e);
        return NextResponse.json({ error: 'Failed to fetch pracas' }, { status: 500 });
    }
}
