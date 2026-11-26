import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readSessionToken } from '@/lib/auth/session';
import { listCircuits, resolveSession } from '@/lib/db/repo';
import { cloudEnabled } from '@/lib/db/supabase';
import { AccountClient } from './AccountClient';
import { CircuitDoc } from '@/lib/engine/types';

export const metadata: Metadata = {
  title: 'Mon compte',
  description:
    'Profil, historique des montages, apparence et sécurité : gérez votre compte Northev Spark.',
};

export const dynamic = 'force-dynamic';

export default async function ComptePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;

  if (!user) {
    return <AccountClient mode={params.mode === 'inscription' ? 'inscription' : 'connexion'} user={null} circuits={[]} cloud={cloudEnabled()} />;
  }

  if (params.mode === 'inscription' || params.mode === 'connexion') {
    redirect('/compte');
  }

  const circuits = await listCircuits(user.id);
  return (
    <AccountClient
      mode="profile"
      user={user}
      cloud={cloudEnabled()}
      circuits={circuits.map((c) => ({
        id: c.id,
        name: c.name,
        notes: c.notes,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        starred: c.starred,
        status: c.status,
        templateSlug: c.templateSlug,
        lastResult: c.lastResult,
        collaborators: c.collaborators.length,
        preview: JSON.stringify(c.doc as CircuitDoc),
      }))}
    />
  );
}
