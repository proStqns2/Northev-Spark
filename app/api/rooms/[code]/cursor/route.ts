import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession, updateCursor } from '@/lib/db/repo';
import { z } from 'zod';
import type { CursorState } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

const bodySchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  vx: z.number().finite().optional(),
  vy: z.number().finite().optional(),
  vw: z.number().finite().optional(),
  vh: z.number().finite().optional(),
  hover: z.string().max(64).nullable().optional(),
  tool: z.string().max(24).optional(),
  at: z.number().finite().optional(),
  activity: z.string().max(80).optional(),
  idle: z.boolean().optional(),
});

/** Mise à jour du curseur (appelée à ~10 Hz par le studio). */
export async function POST(request: Request, { params }: Params) {
  const { code } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Curseur invalide.' }, { status: 422 });
  }
  const data = parsed.data;

  // zéro ou absence de coordonnées ⇒ curseur masqué (utilisateur inactif)
  const hidden =
    data.idle === true ||
    data.x === undefined ||
    data.y === undefined ||
    (data.x === 0 && data.y === 0);
  const cursor: CursorState | null = hidden
    ? null
    : {
        x: data.x as number,
        y: data.y as number,
        vx: data.vx,
        vy: data.vy,
        vw: data.vw,
        vh: data.vh,
        hover: data.hover ?? null,
        tool: data.tool,
        at: Date.now(),
      };

  const presenceRev = await updateCursor(code, user, cursor, data.activity);
  if (presenceRev === null) {
    return NextResponse.json({ error: 'Atelier introuvable ou fermé.' }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, rev: presenceRev },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
