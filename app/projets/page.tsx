import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readSessionToken } from '@/lib/auth/session';
import { listProjects, resolveSession } from '@/lib/db/repo';
import { TEMPLATES } from '@/lib/data/templates';
import { ProjetsClient } from './ProjetsClient';

export const metadata: Metadata = {
  title: 'Projets',
  description:
    'Organisez vos montages en projets : plusieurs ateliers, un historique par projet, des membres et des rôles.',
};

export const dynamic = 'force-dynamic';

export default async function ProjetsPage() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) redirect('/compte?mode=connexion');

  const projects = await listProjects(user.id);

  return (
    <ProjetsClient
      user={{ id: user.id, name: user.name }}
      projects={projects.map((project) => ({
        ...project,
        isOwner: project.ownerId === user.id,
        memberCount: project.members.length,
      }))}
      templates={TEMPLATES.map((t) => ({
        slug: t.slug,
        title: t.title,
        subtitle: t.subtitle,
        accent: t.accent,
        regime: t.regime,
        difficulty: t.difficulty,
      }))}
    />
  );
}
