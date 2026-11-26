'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[northev] erreur applicative', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-spark-coral/40 bg-spark-coral/[0.07] text-spark-coral">
        <AlertTriangle size={24} />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Un composant a grillé.</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-fg-soft">
        Une erreur inattendue a interrompu le rendu de cette page. Vos montages enregistrés ne sont pas affectés.
      </p>
      <pre className="mt-4 max-w-full overflow-x-auto rounded-lg border border-line/60 bg-ink-900/80 p-3 text-left font-mono text-[10.5px] text-fg-mute">
        {error.message}
        {error.digest ? `\n(digest ${error.digest})` : ''}
      </pre>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          <RefreshCw size={15} /> Réessayer
        </button>
        <Link href="/studio" className="btn">
          Retour au studio
        </Link>
      </div>
    </div>
  );
}
