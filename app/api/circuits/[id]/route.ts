import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { deleteCircuit, getCircuit, resolveSession, toggleStar, updateCircuit } from '@/lib/db/repo';
import { cachedEquivalent } from '@/lib/cache';
import { circuitDocSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

async function guard() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  return user;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { id } = await params;
  const circuit = await getCircuit(id, user.id);
  if (!circuit) return NextResponse.json({ error: 'Montage introuvable.' }, { status: 404 });
  return NextResponse.json({ circuit }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { id } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const body = payload as {
    doc?: unknown;
    notes?: unknown;
    starred?: unknown;
    status?: unknown;
    projectId?: unknown;
  };

  if (body.starred !== undefined && body.doc === undefined) {
    const starred = await toggleStar(id, user.id);
    if (starred === null) return NextResponse.json({ error: 'Montage introuvable.' }, { status: 404 });
    return NextResponse.json({ starred });
  }

  const patch: Record<string, unknown> = {};
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 2000);
  if (body.status === 'draft' || body.status === 'published' || body.status === 'archived') {
    patch.status = body.status;
  }
  if (body.projectId === null) patch.projectId = undefined;
  else if (typeof body.projectId === 'string' && /^prj_[a-z0-9]{4,}$/i.test(body.projectId)) {
    patch.projectId = body.projectId;
  }
  if (body.doc !== undefined) {
    const parsed = circuitDocSchema.safeParse(body.doc);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Montage invalide.' }, { status: 422 });
    }
    const doc = parsed.data as CircuitDoc;
    patch.doc = doc;
    patch.name = doc.name;
    const eq = cachedEquivalent(doc);
    if (eq.ok) {
      patch.lastResult = {
        vth: Math.hypot(eq.vth.re, eq.vth.im),
        rth: Math.hypot(eq.rth.re, eq.rth.im),
        inorton: Math.hypot(eq.inorton.re, eq.inorton.im),
        regime: doc.regime,
      };
    }
  }
  const circuit = await updateCircuit(id, user.id, patch);
  if (!circuit) return NextResponse.json({ error: 'Montage introuvable.' }, { status: 404 });
  return NextResponse.json({ circuit });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { id } = await params;
  const ok = await deleteCircuit(id, user.id);
  if (!ok) return NextResponse.json({ error: 'Suppression impossible.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
