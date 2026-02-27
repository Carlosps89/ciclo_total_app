import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/request';
import { decrypt } from './lib/auth';

// Proteção de rotas
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 1. Definir rotas públicas
  const isPublicRoute = path === '/login' || path.startsWith('/api/login');

  // 2. Tentar obter a sessão do cookie
  const session = request.cookies.get('session')?.value;

  // 3. Redirecionar se não houver sessão e a rota for privada
  if (!isPublicRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // 4. Se houver sessão, verificar validade
  if (session) {
    try {
      const payload = await decrypt(session);
      
      // Bloqueio específico por Role (Exemplo: Operação não acessa histórico)
      if (path.startsWith('/historico') || path.startsWith('/forecast')) {
        if (payload.user?.role === 'OPERACAO') {
          return NextResponse.redirect(new URL('/', request.nextUrl));
        }
      }

      // Bloqueio de Admin
      if (path.startsWith('/admin')) {
        if (payload.user?.role !== 'ADM') {
          return NextResponse.redirect(new URL('/', request.nextUrl));
        }
      }

      // Se tentar acessar login já estando logado, manda pro dash
      if (path === '/login') {
        return NextResponse.redirect(new URL('/', request.nextUrl));
      }
    } catch (e) {
      // Token inválido ou expirado
      if (!isPublicRoute) {
        return NextResponse.redirect(new URL('/login', request.nextUrl));
      }
    }
  }

  return NextResponse.next();
}

// Configurar quais rotas o middleware deve observar
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (internal APIs we don't want to block session-wise yet or handled separately)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (assets)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
    '/'
  ],
};
