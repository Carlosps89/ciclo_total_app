import { NextRequest, NextResponse } from 'next/server';
import db from '../../../../../lib/db';

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const terminal = url.searchParams.get('terminal') || 'TRO';

        const rows = db.prepare("SELECT plate FROM fast_pass_plates WHERE terminal = ? ORDER BY added_at ASC").all(terminal) as { plate: string }[];
        const plates = rows.map(r => r.plate);

        return NextResponse.json({ plates }, { status: 200 });
    } catch (e: any) {
        console.error("Fast Pass Config GET Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { terminal, plates } = body;

        if (!terminal || !Array.isArray(plates)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const transaction = db.transaction((term: string, plList: string[]) => {
            // Delete all existing for this terminal
            db.prepare("DELETE FROM fast_pass_plates WHERE terminal = ?").run(term);
            
            // Insert new ones
            const insert = db.prepare("INSERT INTO fast_pass_plates (terminal, plate) VALUES (?, ?)");
            for (const pl of plList) {
                insert.run(term, pl);
            }
        });

        transaction(terminal, plates);

        return NextResponse.json({ success: true, plates }, { status: 200 });
    } catch (e: any) {
        console.error("Fast Pass Config POST Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
