import { NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import fs from 'fs/promises';
import path from 'path';

const USERS_FILE = process.env.USERS_PATH || path.join(process.cwd(), 'src/data/users.json');

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const cleanEmail = email?.trim().toLowerCase();
    const cleanPassword = password?.trim();

    // Ler usuário do store JSON dinamicamente (evita cache do import)
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    const users = JSON.parse(data);

    const user = users.find((u: any) => 
      u.email.toLowerCase() === cleanEmail && 
      u.password === cleanPassword
    );

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
    return NextResponse.json(
      { error: 'Erro no servidor' },
      { status: 500 }
    );
  }
}
