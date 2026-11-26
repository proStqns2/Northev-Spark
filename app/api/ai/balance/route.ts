import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { circuitDocSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';
import { rebalanceDoc } from '@/lib/engine/rebalance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ doc: circuitDocSchema });

/** POST /api/ai/balance → montage rééquilibré + liste des corrections */
export async function POST(request: Request) {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour rééquilibrer un montage.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Montage invalide.' },
      { status: 422 },
    );
  }

  const result = rebalanceDoc(parsed.data.doc as CircuitDoc);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
