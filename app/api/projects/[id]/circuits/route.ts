import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/session';
import { attachCircuitsToProject, resolveSession } from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ circuitIds: z.array(z.string().max(64)).min(1).max(50) });

export async function POST(request: Request, { params }: Params) {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { id } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Sélection invalide.' }, { status: 422 });

  const moved = await attachCircuitsToProject(id, user.id, parsed.data.circuitIds);
  return NextResponse.json({ moved });
}
