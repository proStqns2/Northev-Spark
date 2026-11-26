import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { readSessionToken } from '@/lib/auth/session';
import { getProject, listCircuits, listProjects, resolveSession } from '@/lib/db/repo';
import { TEMPLATES } from '@/lib/data/templates';
import { ProjectDetailClient } from './ProjectDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return { title: 'Projet' };
  const project = await getProject(id, user.id);
  return {
    title: project ? project.name : 'Projet introuvable',
    description: project?.description || 'Projet Northev Spark : montages, ateliers et membres.',
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) redirect('/compte?mode=connexion');

  const project = await getProject(id, user.id);
  if (!project) notFound();

  const circuits = await listCircuits(user.id, { projectId: id });
  const summary = (await listProjects(user.id)).find((p) => p.id === id);

  return (
    <ProjectDetailClient
      viewer={{ id: user.id, name: user.name }}
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        archived: project.archived,
        ownerId: project.ownerId,
        isOwner: project.ownerId === user.id,
        members: project.members,
        rooms: summary?.rooms ?? [],
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }}
      circuits={circuits.map((circuit) => ({
        id: circuit.id,
        name: circuit.name,
        notes: circuit.notes,
        updatedAt: circuit.updatedAt,
        starred: circuit.starred,
        status: circuit.status,
        collaborators: circuit.collaborators.length,
        components: (circuit.doc as { components?: unknown[] } | undefined)?.components?.length ?? 0,
      }))}
      templates={TEMPLATES.map((template) => ({
        slug: template.slug,
        title: template.title,
        subtitle: template.subtitle,
        accent: template.accent,
        regime: template.regime,
      }))}
    />
  );
}
