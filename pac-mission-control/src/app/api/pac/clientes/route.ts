import { NextResponse } from 'next/server';
import { getClients } from '@/lib/db';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const terminal = searchParams.get('terminal') || 'TRO';

    try {
        const clientesList = getClients(terminal);
        // Prefix with 'TODOS OS CLIENTES'
        const result = ['', ...clientesList];

        return NextResponse.json({
            terminal: terminal.toUpperCase(),
            items: result
        });
    } catch (e) {
        console.error("[API Clientes] Error", e);
        return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
    }
}
