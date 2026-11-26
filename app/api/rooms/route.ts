import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { createCircuit, createRoom, listRoomsFor, resolveSession } from '@/lib/db/repo';
import { circuitDocSchema, roomCreateSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';
import { cachedEquivalent } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const rooms = await listRoomsFor(user.id);
  return NextResponse.json(
    {
      rooms: rooms.map((r) => ({
        code: r.code,
        name: r.name,
        circuitId: r.circuitId,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        projectId: r.projectId,
        participants: Object.values(r.presence),
        revision: r.revision,
        updatedAt: r.updatedAt,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

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
  const parsed = roomCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Montage invalide.' },
      { status: 422 },
    );
  }
  const doc = circuitDocSchema.parse(parsed.data.doc) as CircuitDoc;
  const eq = cachedEquivalent(doc);

  let circuitId = parsed.data.circuitId;
  if (!circuitId) {
    const circuit = await createCircuit({
      ownerId: user.id,
      name: doc.name,
      notes: doc.notes ?? '',
      doc,
      lastResult: eq.ok
        ? {
            vth: Math.hypot(eq.vth.re, eq.vth.im),
            rth: Math.hypot(eq.rth.re, eq.rth.im),
            inorton: Math.hypot(eq.inorton.re, eq.inorton.im),
            regime: doc.regime,
          }
        : undefined,
    });
    circuitId = circuit.id;
  }

  const room = await createRoom({
    owner: user,
    name: parsed.data.name,
    circuitId,
    doc,
    projectId: parsed.data.projectId,
  });
  return NextResponse.json(
    {
      code: room.code,
      name: room.name,
      circuitId: room.circuitId,
      projectId: room.projectId,
      revision: room.revision,
      createdAt: room.createdAt,
    },
    { status: 201 },
  );
}
