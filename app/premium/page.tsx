import type { Metadata } from 'next';
import { readSessionToken } from '@/lib/auth/session';
import { getCircuit, resolveSession } from '@/lib/db/repo';
import { providerStatus } from '@/lib/ai/providers';
import { PremiumClient } from './PremiumClient';
import { CircuitDoc } from '@/lib/engine/types';
import { sanitizeDoc } from '@/lib/studio/doc';

export const metadata: Metadata = {
  title: 'Hub d’agents IA',
  description:
    'Cinq agents spécialisés — Thévenin, Norton, impédances, contrôle qualité, pédagogie — qui analysent réellement votre montage.',
};

export const dynamic = 'force-dynamic';

export default async function PremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ circuit?: string }>;
}) {
  const params = await searchParams;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  let circuitDoc: CircuitDoc | null = null;
  if (user && params.circuit) {
    const circuit = await getCircuit(params.circuit, user.id);
    if (circuit) circuitDoc = sanitizeDoc(circuit.doc as CircuitDoc);
  }

  const providers = providerStatus();

  return (
    <PremiumClient
      user={user ? { id: user.id, name: user.name } : null}
      circuitDoc={circuitDoc ? JSON.stringify(circuitDoc) : null}
      circuitName={circuitDoc?.name ?? null}
      providers={{ openai: providers.openai, gemini: providers.gemini }}
    />
  );
}
