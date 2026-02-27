import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getSession } from '@/lib/auth';

const USERS_FILE = path.join(process.cwd(), 'src/data/users.json');

export async function GET() {
  const session = await getSession();
  if (session?.user?.role !== 'ADM') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  const data = await fs.readFile(USERS_FILE, 'utf-8');
  return NextResponse.json(JSON.parse(data));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (session?.user?.role !== 'ADM') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  const users = JSON.parse(await fs.readFile(USERS_FILE, 'utf-8'));
  const newUser = await request.json();
  
  // Gerar ID simples
  newUser.id = String(Date.now());
  users.push(newUser);

  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  return NextResponse.json(newUser);
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (session?.user?.role !== 'ADM') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  const { id } = await request.json();
  const users = JSON.parse(await fs.readFile(USERS_FILE, 'utf-8'));
  const filtered = users.filter((u: any) => u.id !== id);

  await fs.writeFile(USERS_FILE, JSON.stringify(filtered, null, 2));
  return NextResponse.json({ success: true });
}
