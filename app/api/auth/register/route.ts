import { NextResponse } from 'next/server';
import { createSession, createUser } from '@/lib/db/repo';
import { registerSchema } from '@/lib/validation';
import { setSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.', issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const result = await createUser(parsed.data);
  if ('error' in result) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 409 });
  }
  const token = await createSession(result.user.id);
  await setSessionCookie(token);
  return NextResponse.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      avatar: result.user.avatar,
      theme: result.user.theme,
    },
  });
}
