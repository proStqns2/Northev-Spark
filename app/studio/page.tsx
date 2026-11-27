import type { Metadata } from 'next';
import { StudioPageClient } from './StudioPageClient';
import { readSessionToken } from '@/lib/auth/session';
import { getCircuit, listProjects, resolveSession } from '@/lib/db/repo';
import { templateDoc } from '@/lib/data/loadDoc';
import { CircuitDoc } from '@/lib/engine/types';
import { sanitizeDoc } from '@/lib/studio/doc';
import { TEMPLATES } from '@/lib/data/templates';

export const metadata: Metadata = {
  title: 'Studio',
  description:
    'Construisez votre montage sur grille : palettes de dipôles, animation des électrons, calcul Thévenin / Norton en direct.',
};

export const dynamic = 'force-dynamic';

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ circuit?: string; template?: string; agent?: string; project?: string }>;
}) {
  const params = await searchParams;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;

  let doc: CircuitDoc | null = null;
  let projectId: string | undefined;
  if (params.circuit && user) {
    const circuit = await getCircuit(params.circuit, user.id);
    if (circuit) {
      doc = sanitizeDoc(circuit.doc as CircuitDoc);
      projectId = circuit.projectId;
    }
  }
  const projects = user ? await listProjects(user.id) : [];
  // montage rattaché à un projet dès l'ouverture (`/studio?template=…&project=prj_…`)
  if (!projectId && params.project && projects.some((p) => p.id === params.project)) {
    projectId = params.project;
  }
  if (!doc && params.template) {
    doc = templateDoc(params.template);
  }
  // Amorçage : plutôt qu'une grille vide (l'utilisateur ne sait pas quoi faire),
  // on ouvre sur un montage complet et calculable — il peut le vider d'un geste.
  const seeded = !doc;
  const initialDoc = doc ?? templateDoc('thevenin-serie');

  return (
    <StudioPageClient
      user={user ? { id: user.id, name: user.name } : null}
      circuitId={params.circuit}
      templateSlug={params.template}
      agentId={params.agent}
      templateDocJson={initialDoc ? JSON.stringify(initialDoc) : null}
      seeded={seeded}
      projectOptions={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
      initialProjectId={projectId}
      aiEnabled={Boolean(process.env.AI_ASSISTANT_ENABLED === 'on' || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)}
      templates={TEMPLATES.map((t) => ({
        slug: t.slug,
        title: t.title,
        subtitle: t.subtitle,
        accent: t.accent,
        regime: t.regime,
        components: t.build().components.length,
      }))}
    />
  );
}
