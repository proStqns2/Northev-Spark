import type { Metadata } from 'next';
import { StudioPageClient } from './StudioPageClient';
import { readSessionToken } from '@/lib/auth/session';
import { getCircuit, resolveSession } from '@/lib/db/repo';
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
  searchParams: Promise<{ circuit?: string; template?: string }>;
}) {
  const params = await searchParams;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;

  let doc: CircuitDoc | null = null;
  if (params.circuit && user) {
    const circuit = await getCircuit(params.circuit, user.id);
    if (circuit) {
      doc = sanitizeDoc(circuit.doc as CircuitDoc);
    }
  }
  if (!doc && params.template) {
    doc = templateDoc(params.template);
  }

  return (
    <StudioPageClient
      user={user ? { id: user.id, name: user.name } : null}
      circuitId={params.circuit}
      templateSlug={params.template}
      templateDocJson={doc ? JSON.stringify(doc) : null}
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
