import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = process.env.JWT_SECRET || 'rumo-pac-mission-control-secret-key-2026';
const key = new TextEncoder().encode(SECRET_KEY);

export async function encrypt(payload: { user: any, expires: Date }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  const { payload } = await jwtVerify(input, key, {
    algorithms: ['HS256'],
  });
  return payload;
}

export async function getSession() {
  const session = (await cookies()).get('session')?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function login(user: { id: string, name: string, email: string, role: string }) {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const session = await encrypt({ user, expires });

  (await cookies()).set('session', session, { expires, httpOnly: true });
}

export async function logout() {
  (await cookies()).set('session', '', { expires: new Date(0) });
}
