import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { readSessionToken } from '@/lib/auth/session';
import { getProject, listCircuits, listProjects, resolveSession } from '@/lib/db/repo';
import { ProjetDetail } from './ProjetDetail';
import { CircuitDoc } from '@/lib/engine/types';
import { cachedEquivalent } from '@/lib/cache';
import { abs } from '@/lib/engine/complex';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return { title: 'Projet' };
  const project = await getProject(id, user.id);
  return {
    title: project?.name ?? 'Projet',
    description: project?.description ?? 'Projet Northev Spark',
  };
}

export default async function ProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) redirect('/compte?mode=connexion');

  const project = await getProject(id, user.id);
  if (!project) notFound();

  const circuits = await listCircuits(user.id, { projectId: id });
  const summary = (await listProjects(user.id)).find((p) => p.id === id);

  return (
    <ProjetDetail
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        icon: project.icon,
        ownerId: project.ownerId,
        members: project.members,
        createdAt: project.createdAt,
        lastActivity: summary?.lastActivity ?? project.updatedAt,
        openRooms: summary?.openRooms ?? 0,
        rooms: summary?.rooms ?? [],
        isOwner: project.ownerId === user.id,
      }}
      viewer={{ id: user.id, name: user.name }}
      circuits={circuits.map((circuit) => {
        const doc = circuit.doc as CircuitDoc;
        const equivalent = cachedEquivalent(doc);
        return {
          id: circuit.id,
          name: circuit.name,
          notes: circuit.notes,
          updatedAt: circuit.updatedAt,
          starred: circuit.starred,
          status: circuit.status,
          collaborators: circuit.collaborators.length,
          components: doc.components?.length ?? 0,
          doc: doc as unknown as Record<string, unknown>,
          expected: equivalent.ok
            ? {
                vth: abs(equivalent.vth),
                rth: abs(equivalent.rth),
                inorton: abs(equivalent.inorton),
              }
            : null,
        };
      })}
    />
  );
}
