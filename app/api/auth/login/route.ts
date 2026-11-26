import { NextResponse } from 'next/server';
import { authenticate, createSession } from '@/lib/db/repo';
import { loginSchema } from '@/lib/validation';
import { setSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 422 },
    );
  }
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json(
      { error: 'Adresse e-mail ou mot de passe incorrect.' },
      { status: 401 },
    );
  }
  const token = await createSession(user.id);
  await setSessionCookie(token);
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      theme: user.theme,
    },
  });
}
