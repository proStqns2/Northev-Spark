import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/session';
import { createProject, listProjects, resolveSession } from '@/lib/db/repo';
import { TEMPLATES } from '@/lib/data/templates';
import { templateDoc } from '@/lib/data/loadDoc';
import { createCircuit } from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(400).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(24).optional(),
  templateSlug: z.string().max(64).optional(),
  starterCircuits: z.array(z.string().max(64)).max(12).optional(),
});

export async function GET() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const projects = await listProjects(user.id);
  return NextResponse.json(
    {
      projects: projects.map((p) => ({
        ...p,
        memberCount: p.members.length,
        isOwner: p.ownerId === user.id,
      })),
      templates: TEMPLATES.map((t) => ({ slug: t.slug, title: t.title, subtitle: t.subtitle, accent: t.accent })),
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
  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 422 },
    );
  }

  const project = await createProject({
    owner: user,
    name: parsed.data.name,
    description: parsed.data.description,
    color: parsed.data.color,
    icon: parsed.data.icon,
  });

  // montages de départ du projet
  const slugs = parsed.data.starterCircuits?.length
    ? parsed.data.starterCircuits
    : parsed.data.templateSlug
      ? [parsed.data.templateSlug]
      : [];
  for (const slug of slugs) {
    const doc = templateDoc(slug);
    if (!doc) continue;
    await createCircuit({
      ownerId: user.id,
      name: doc.name,
      notes: doc.notes ?? '',
      doc,
      templateSlug: slug,
      projectId: project.id,
    });
  }

  return NextResponse.json({ project }, { status: 201 });
}
