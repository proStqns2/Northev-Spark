import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { findRoom, leaveRoom, livePresence, resolveSession, touchRoom } from '@/lib/db/repo';
import { roomPatchSchema } from '@/lib/validation';
import { publishRoomEvent } from '@/lib/db/supabase';
import { CircuitDoc } from '@/lib/engine/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(request: Request, { params }: Params) {
  const { code } = await params;
  const url = new URL(request.url);
  const since = Number(url.searchParams.get('rev') ?? '0');
  const isPoll = url.searchParams.has('rev');

  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const room = await findRoom(code);
  if (!room) {
    return NextResponse.json({ error: 'Atelier introuvable ou fermé.', code: 'room_not_found' }, { status: 404, headers: NO_STORE });
  }

  const presence = livePresence(room);

  if (isPoll) {
    if (user) {
      const previous = room.presence[user.id];
      room.presence[user.id] = {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        color: previous?.color ?? '#38e1e6',
        at: new Date().toISOString(),
        cursor: previous?.cursor,
        idle: previous?.idle,
        activity: previous?.activity,
        seenAt: Date.now(),
      };
      await touchRoom(code, { presence: room.presence });
    }
    return NextResponse.json(
      {
        code: room.code,
        name: room.name,
        revision: room.revision,
        changed: room.revision > since,
        doc: room.revision > since ? room.doc : undefined,
        participants: presence,
        messages: room.messages.slice(-40),
        ownerId: room.ownerId,
        ownerName: room.ownerName,
        circuitId: room.circuitId,
      projectId: room.projectId,
      },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json(
    {
      code: room.code,
      name: room.name,
      revision: room.revision,
      doc: room.doc,
      participants: presence,
      messages: room.messages.slice(-40),
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      circuitId: room.circuitId,
    },
    { headers: NO_STORE },
  );
}

export async function PATCH(request: Request, { params }: Params) {
  const { code } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const room = await findRoom(code);
  if (!room) {
    return NextResponse.json({ error: 'Atelier introuvable ou fermé.' }, { status: 404, headers: NO_STORE });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = roomPatchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 422 },
    );
  }

  const messages = [...room.messages];
  if (parsed.data.message) {
    messages.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      authorId: user.id,
      authorName: user.name,
      text: parsed.data.message,
      at: new Date().toISOString(),
    });
  }

  const doc = parsed.data.doc as CircuitDoc | undefined;
  const updated = await touchRoom(code, {
    doc: doc ?? room.doc,
    name: parsed.data.name ?? room.name,
    messages: messages.slice(-80),
    revision: room.revision + 1,
    presence: {
      ...room.presence,
      [user.id]: {
        ...room.presence[user.id],
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        color: room.presence[user.id]?.color ?? '#38e1e6',
        at: new Date().toISOString(),
        seenAt: Date.now(),
      },
    },
  });

  void publishRoomEvent({ code, kind: doc ? 'doc' : 'chat', userId: user.id, data: { revision: updated?.revision } }).catch(
    () => undefined,
  );

  return NextResponse.json(
    { revision: updated?.revision ?? room.revision + 1, savedAt: updated?.updatedAt },
    { headers: NO_STORE },
  );
}

export async function DELETE(_request: Request, { params }: Params) {
  const { code } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  await leaveRoom(code, user.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
