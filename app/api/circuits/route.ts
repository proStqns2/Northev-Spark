import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { createCircuit, listCircuits, resolveSession, syncUserCloud } from '@/lib/db/repo';
import { cachedEquivalent } from '@/lib/cache';
import { circuitDocSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const url = new URL(request.url);
  let imported = 0;
  let cloud = false;
  if (url.searchParams.get('sync') === '1') {
    const result = await syncUserCloud(user.id);
    imported = result.imported;
    cloud = result.cloud;
  }
  const items = await listCircuits(user.id, {
    q: url.searchParams.get('q') ?? undefined,
    starred: url.searchParams.get('starred') === '1',
  });
  return NextResponse.json(
    { circuits: items, synced: { imported, cloud } },
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
  const body = payload as {
    doc?: unknown;
    notes?: unknown;
    templateSlug?: unknown;
    projectId?: unknown;
  };
  const projectId =
    typeof body.projectId === 'string' && /^prj_[a-z0-9]{4,}$/i.test(body.projectId)
      ? body.projectId
      : undefined;
  const parsed = circuitDocSchema.safeParse(body.doc);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Montage invalide : ' + (parsed.error.issues[0]?.message ?? ''), issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const doc = parsed.data as CircuitDoc;
  const eq = cachedEquivalent(doc);
  const circuit = await createCircuit({
    ownerId: user.id,
    name: doc.name,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : (doc.notes ?? ''),
    doc,
    templateSlug: typeof body.templateSlug === 'string' ? body.templateSlug : undefined,
    projectId,
    lastResult: eq.ok
      ? {
          vth: Math.hypot(eq.vth.re, eq.vth.im),
          rth: Math.hypot(eq.rth.re, eq.rth.im),
          inorton: Math.hypot(eq.inorton.re, eq.inorton.im),
          regime: doc.regime,
        }
      : undefined,
  });
  return NextResponse.json({ circuit }, { status: 201 });
}
