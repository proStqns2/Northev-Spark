import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/session';
import {
  deleteProject,
  getProject,
  listCircuits,
  listProjects,
  resolveSession,
  updateProject,
} from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(400).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(24).optional(),
  archived: z.boolean().optional(),
});

async function guard() {
  const token = await readSessionToken();
  return token ? resolveSession(token) : null;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id, user.id);
  if (!project) return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 });

  const circuits = await listCircuits(user.id, { projectId: id });
  const summary = (await listProjects(user.id)).find((p) => p.id === id);

  return NextResponse.json(
    {
      project: {
        ...project,
        isOwner: project.ownerId === user.id,
        circuits: summary?.circuits ?? circuits.length,
        openRooms: summary?.openRooms ?? 0,
        lastActivity: summary?.lastActivity ?? project.updatedAt,
      },
      circuits: circuits.map((c) => ({
        id: c.id,
        name: c.name,
        notes: c.notes,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        starred: c.starred,
        status: c.status,
        lastResult: c.lastResult,
        collaborators: c.collaborators.length,
        preview: c.doc,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
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
  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides.' }, { status: 422 });
  }
  const ok = await updateProject(id, user.id, parsed.data);
  if (!ok) return NextResponse.json({ error: 'Modification refusée.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { id } = await params;
  const ok = await deleteProject(id, user.id);
  if (!ok) return NextResponse.json({ error: 'Suppression réservée au propriétaire.' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
