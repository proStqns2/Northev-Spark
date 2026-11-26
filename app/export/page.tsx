import type { Metadata } from 'next';
import { readSessionToken } from '@/lib/auth/session';
import { listCircuits, resolveSession } from '@/lib/db/repo';
import { ExportClient } from './ExportClient';
import { CircuitDoc } from '@/lib/engine/types';
import { TEMPLATES } from '@/lib/data/templates';

export const metadata: Metadata = {
  title: 'Export & invitation',
  description:
    'Exportez vos montages en PNG, SVG, HTML, JSON et Markdown, et générez une carte d’invitation multiwork.',
};

export const dynamic = 'force-dynamic';

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ circuit?: string }>;
}) {
  const params = await searchParams;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const circuits = user ? await listCircuits(user.id) : [];

  const defaultDoc = TEMPLATES[0].build();
  const target = params.circuit ? circuits.find((c) => c.id === params.circuit) : circuits[0];

  return (
    <ExportClient
      user={user ? { id: user.id, name: user.name } : null}
      circuits={circuits.map((c) => ({
        id: c.id,
        name: c.name,
        updatedAt: c.updatedAt,
        preview: JSON.stringify(c.doc as CircuitDoc),
      }))}
      initialDoc={JSON.stringify((target?.doc as CircuitDoc) ?? defaultDoc)}
      initialName={target?.name ?? defaultDoc.name}
    />
  );
}
