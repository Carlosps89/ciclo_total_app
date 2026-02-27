import { NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import users from '@/data/users.json';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Buscar usuário no store JSON
    const user = users.find(u => u.email === email && u.password === password);

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
