import { NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import db from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const cleanEmail = email?.trim().toLowerCase();
    const cleanPassword = password?.trim();

    // Buscar usuário no banco SQLite
    const user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ? AND password = ?")
                   .get(cleanEmail, cleanPassword) as any;

    if (!user) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    // Criar sessão (Cookie assinado com jose)
    await login({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });

    return NextResponse.json({ success: true, role: user.role });
  } catch (error) {
    console.error('[Login API Error]:', error);
    return NextResponse.json(
      { error: 'Erro no servidor' },
      { status: 500 }
    );
  }
}
