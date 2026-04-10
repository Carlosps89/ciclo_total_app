
import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'data/pac_history.db');

export async function GET() {
    try {
        const db = new Database(DB_PATH);
        const targets = db.prepare("SELECT * FROM plaza_targets ORDER BY terminal, origem").all();
        return NextResponse.json(targets);
    } catch (error) {
        return NextResponse.json({ error: 'Erro ao buscar metas' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { terminal, origem, meta_h } = await request.json();
        
        if (!terminal || !origem || typeof meta_h !== 'number') {
            return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
        }

        const db = new Database(DB_PATH);
        db.prepare("INSERT OR REPLACE INTO plaza_targets (terminal, origem, meta_h) VALUES (?, ?, ?)")
            .run(terminal, origem.toUpperCase(), meta_h);
            
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Erro ao salvar meta' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { terminal, origem } = await request.json();
        const db = new Database(DB_PATH);
        db.prepare("DELETE FROM plaza_targets WHERE terminal = ? AND origem = ?")
            .run(terminal, origem);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Erro ao remover meta' }, { status: 500 });
    }
}
