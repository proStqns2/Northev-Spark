import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { joinRoom, resolveSession } from '@/lib/db/repo';
import { roomJoinSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = roomJoinSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Code invalide.' },
      { status: 422 },
    );
  }
  const result = await joinRoom(parsed.data.code, user);
  if ('error' in result) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 404 });
  }
  return NextResponse.json({
    code: result.room.code,
    name: result.room.name,
    circuitId: result.room.circuitId,
    ownerName: result.room.ownerName,
    participants: Object.entries(result.room.presence).map(([id, p]) => ({ id, ...p })),
    revision: result.room.revision,
    updatedAt: result.room.updatedAt,
  });
}
