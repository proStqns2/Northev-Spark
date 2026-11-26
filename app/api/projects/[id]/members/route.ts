import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/session';
import { addProjectMember, getProject, resolveSession } from '@/lib/db/repo';
import { findUserByEmail } from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  role: z.enum(['editor', 'viewer']).optional(),
});

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
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 422 },
    );
  }

  const project = await getProject(id, user.id);
  if (!project) return NextResponse.json({ error: 'Projet introuvable.' }, { status: 404 });

  const target = await findUserByEmail(parsed.data.email);
  if (!target) {
    return NextResponse.json(
      { error: 'Aucun compte ne correspond à cette adresse. Demandez-lui de créer un compte Northev Spark.' },
      { status: 404 },
    );
  }
  const ok = await addProjectMember(id, user.id, {
    id: target.id,
    name: target.name,
    role: parsed.data.role,
  });
  if (!ok) return NextResponse.json({ error: 'Invitation impossible (droits insuffisants).' }, { status: 403 });
  return NextResponse.json({ ok: true, member: { id: target.id, name: target.name } });
}
