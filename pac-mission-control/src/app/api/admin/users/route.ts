import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import db from '@/lib/db';

export async function GET() {
  const session = await getSession();
  if (session?.user?.role !== 'ADM') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  try {
    const users = db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as any[];
    // Parse JSON config for each user
    const formatted = users.map(u => ({
      ...u,
      reports_config: u.reports_config ? JSON.parse(u.reports_config) : { daily: false, fraud: false }
    }));
    return NextResponse.json(formatted);
  } catch (e) {
    console.error("[API/Users] Error fetching users:", e);
    return NextResponse.json({ error: 'Erro ao buscar usuários no banco' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.user?.role !== 'ADM') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = body.id || String(Date.now());
    
    const reportsConfig = JSON.stringify(body.reports_config || { 
      daily: body.role === 'ADM', 
      fraud: body.role === 'ADM' 
    });

    const stmt = db.prepare(`
        INSERT INTO users (id, name, email, password, role, whatsapp_number, reports_config)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        id,
        body.name?.trim(),
        body.email?.trim().toLowerCase(),
        body.password?.trim(),
        body.role,
        body.whatsapp_number?.replace(/\D/g, '') || null,
        reportsConfig
    );

    return NextResponse.json({ id, success: true });
  } catch (e: any) {
    console.error("[API/Users] Error creating user:", e);
    return NextResponse.json({ error: 'Erro ao criar usuário: ' + e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (session?.user?.role !== 'ADM') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  try {
    const { id } = await request.json();
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao excluir usuário' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (session?.user?.role !== 'ADM') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, name, email, role, whatsapp_number, reports_config } = body;
    
    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];

    if (name) { updates.push("name = ?"); params.push(name.trim()); }
    if (email) { updates.push("email = ?"); params.push(email.trim().toLowerCase()); }
    if (role) { updates.push("role = ?"); params.push(role); }
    if (whatsapp_number !== undefined) { updates.push("whatsapp_number = ?"); params.push(whatsapp_number?.replace(/\D/g, '') || null); }
    if (reports_config) { updates.push("reports_config = ?"); params.push(JSON.stringify(reports_config)); }

    if (updates.length === 0) {
        return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    params.push(id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[API/Users] Error updating user:", e);
    return NextResponse.json({ error: 'Erro ao atualizar usuário: ' + e.message }, { status: 500 });
  }
}
