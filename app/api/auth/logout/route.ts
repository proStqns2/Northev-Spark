import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/db/repo';
import { clearSessionCookie, readSessionToken } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST() {
  const token = await readSessionToken();
  if (token) await destroySession(token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
