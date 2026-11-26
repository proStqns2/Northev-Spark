import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { cloudEnabled } from '@/lib/db/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  return NextResponse.json({ user, cloud: cloudEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
}
