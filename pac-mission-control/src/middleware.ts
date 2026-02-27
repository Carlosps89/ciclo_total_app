import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// Secret key deve ser idêntica à do lib/auth.ts
const SECRET_KEY = process.env.JWT_SECRET || 'rumo-pac-mission-control-secret-key-2026';
const key = new TextEncoder().encode(SECRET_KEY);

async function decrypt(input: string): Promise<any> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  });
  return payload;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Definir o que é ABSOLUTAMENTE público (Assets)
  const isAsset = 
    pathname.startsWith('/_next') || 
    pathname.includes('/favicon.ico') || 
    pathname.startsWith('/public') ||
    pathname.startsWith('/images');

  if (isAsset) return NextResponse.next();

  // 2. Rotas de Autenticação (Públicas mas controladas)
  const isLoginPage = pathname === '/login';
  const isLoginApi = pathname === '/api/login';

  // 3. Obter Sessão
  const sessionToken = request.cookies.get('session')?.value;

  // 4. Lógica de Redirecionamento
  if (!sessionToken) {
    if (isLoginPage || isLoginApi) {
      return NextResponse.next();
    }
    // BLOQUEIO TOTAL: Qualquer outra rota ou API sem token vai pro Login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 5. Validar Token Existente
  try {
    const payload = await decrypt(sessionToken);
    const userRole = payload.user?.role;

    // Se logado e for pro login, volta pro home
    if (isLoginPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // RBAC: BLOQUEIOS POR PERFIL
    if (userRole === 'OPERACAO') {
      if (pathname.startsWith('/historico') || pathname.startsWith('/forecast') || pathname.startsWith('/admin')) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } else if (userRole === 'ANALISTA') {
      if (pathname.startsWith('/admin')) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    return NextResponse.next();
  } catch (error) {
    // Token inválido ou corrompido
    if (isLoginPage) return NextResponse.next();
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session');
    return response;
  }
}

// MATCHER: Permite arquivos estáticos e imagens sem passar pelo middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (pasta de imagens na raiz do public)
     */
    '/((?!_next/static|_next/image|favicon.ico|images|public).*)',
  ],
};
