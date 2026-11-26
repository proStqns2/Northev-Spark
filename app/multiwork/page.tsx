import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readSessionToken } from '@/lib/auth/session';
import { listProjects, listRoomsFor, resolveSession } from '@/lib/db/repo';
import { Template, TEMPLATES } from '@/lib/data/templates';
import { MultiworkHub } from './MultiworkHub';

export const metadata: Metadata = {
  title: 'Multiwork',
  description:
    'Travaillez à plusieurs sur le même montage : ouvrez un atelier, partagez un code à 5 chiffres, éditez ensemble en temps réel.',
};

export const dynamic = 'force-dynamic';

export default async function MultiworkPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const params = await searchParams;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) {
    redirect('/compte?mode=connexion');
  }

  const rooms = await listRoomsFor(user.id);
  const projects = await listProjects(user.id);

  return (
    <MultiworkHub
      user={{ id: user.id, name: user.name, avatar: user.avatar }}
      initialCode={params.code && /^[1-9][0-9]{4}$/.test(params.code) ? params.code : null}
      rooms={rooms.map((r) => ({
        code: r.code,
        name: r.name,
        ownerName: r.ownerName,
        ownerId: r.ownerId,
        projectId: r.projectId,
        participants: Object.entries(r.presence).map(([id, p]) => ({
          id,
          name: p.name,
          color: p.color,
        })),
        revision: r.revision,
        updatedAt: r.updatedAt,
      }))}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        rooms: p.rooms,
      }))}
      templates={TEMPLATES.map((t: Template) => ({
        slug: t.slug,
        title: t.title,
        subtitle: t.subtitle,
        accent: t.accent,
        shape: t.shape,
        regime: t.regime,
      }))}
    />
  );
}
