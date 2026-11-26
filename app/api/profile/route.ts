import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { changePassword, resolveSession, updateUser } from '@/lib/db/repo';
import { profileSchema } from '@/lib/validation';
import { MIN_PASSWORD } from '@/lib/auth/config';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function currentUser() {
  const token = await readSessionToken();
  return token ? resolveSession(token) : null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 422 },
    );
  }
  const updated = await updateUser(user.id, parsed.data);
  return NextResponse.json({ user: updated });
}

const passwordSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(MIN_PASSWORD).max(200),
});

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = passwordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.` },
      { status: 422 },
    );
  }
  const result = await changePassword(user.id, parsed.data.current, parsed.data.next);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ ok: true, reauth: true });
}
