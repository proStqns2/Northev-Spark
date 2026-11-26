'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, ShieldCheck, Timer, X } from 'lucide-react';
import { StudioShell } from '@/components/studio/StudioShell';
import { CircuitDoc } from '@/lib/engine/types';
import { emptyDoc } from '@/lib/studio/doc';
import { clearWorkspace, loadWorkspace } from '@/lib/studio/library';

interface Props {
  user: { id: string; name: string } | null;
  circuitId?: string;
  templateSlug?: string;
  templateDocJson: string | null;
  /** vrai quand le montage d'amorçage est proposé (aucun gabarit demandé) */
  seeded?: boolean;
  projectOptions?: Array<{ id: string; name: string; color: string }>;
  initialProjectId?: string;
  templates: Array<{
    slug: string;
    title: string;
    subtitle: string;
    accent: string;
    regime: 'dc' | 'ac';
    components: number;
  }>;
}

export function StudioPageClient({
  user,
  circuitId,
  templateSlug,
  templateDocJson,
  seeded = false,
  templates,
  projectOptions = [],
  initialProjectId,
}: Props) {
  // Initialisation SYNCHRONE : le studio est rendu dès le serveur (pas d'écran de chargement).
  const [doc, setDoc] = useState<CircuitDoc>(() => {
    if (templateDocJson) {
      try {
        return JSON.parse(templateDocJson) as CircuitDoc;
      } catch {
        return emptyDoc();
      }
    }
    return emptyDoc();
  });
  const [restored, setRestored] = useState(false);
  // rendu serveur immédiat : la restauration du brouillon se fait juste après
  const [ready, setReady] = useState(true);

  // Restauration du brouillon local uniquement hors gabarit explicite.
  useEffect(() => {
    if (templateDocJson) {
      clearWorkspace();
      return;
    }
    const workspace = loadWorkspace();
    if (workspace) {
      setDoc(workspace);
      setRestored(true);
    }
  }, [templateDocJson]);

  return (
    <div className="relative">
      {!ready ? (
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-fg-mute">
            <Timer size={14} className="animate-pulse" /> Préparation de la grille…
          </div>
        </div>
      ) : null}
      {restored ? (
        <div className="flex items-center gap-2 border-b border-spark-amber/30 bg-spark-amber/[0.07] px-4 py-1.5 text-[11px] text-spark-amber">
          <ShieldCheck size={12} />
          Brouillon restauré localement.
          <button
            type="button"
            onClick={() => {
              clearWorkspace();
              setDoc(emptyDoc());
              setRestored(false);
            }}
            className="ml-1 underline decoration-dotted hover:text-fg"
          >
            Repartir d’une grille vide
          </button>
          <button
            type="button"
            onClick={() => setRestored(false)}
            className="ml-auto rounded p-0.5 hover:bg-spark-amber/10"
            aria-label="Masquer"
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {seeded ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-spark-cyan/30 bg-spark-cyan/[0.06] px-3 py-1.5 text-[11px] text-spark-cyan">
          <Layers size={12} />
          <span>
            Montage d’exemple chargé — <strong className="font-semibold">diviseur R₁–R₂</strong>. Modifiez-le,
            ou videz la grille pour partir de zéro.
          </span>
          <button
            type="button"
            onClick={() => {
              clearWorkspace();
              setDoc(emptyDoc());
              setRestored(false);
            }}
            className="ml-auto rounded border border-spark-cyan/40 px-2 py-0.5 font-medium transition hover:bg-spark-cyan/10"
          >
            Grille vide
          </button>
        </div>
      ) : null}

      {!templateDocJson && !circuitId ? (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-line/50 bg-ink-900/40 px-3 py-1.5 no-scrollbar">
          <Link
            href="/bibliotheque"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-line/60 px-2 py-1 text-[11px] text-fg-soft transition hover:border-spark-cyan/50 hover:text-fg"
          >
            <Layers size={11} /> Tous les gabarits
          </Link>
          <span className="h-4 w-px shrink-0 bg-line/60" />
          {templates.slice(0, 8).map((t) => (
            <Link
              key={t.slug}
              href={`/studio?template=${t.slug}`}
              className="shrink-0 rounded-md border border-line/50 px-2 py-1 text-[11px] text-fg-mute transition hover:border-line hover:bg-ink-800 hover:text-fg"
            >
              {t.title}
            </Link>
          ))}
        </div>
      ) : null}

      {ready ? (
      <StudioShell
        mode="solo"
        initialDoc={doc}
        user={user}
        circuitId={circuitId}
        templateSlug={templateSlug}
        projectOptions={projectOptions}
        initialProjectId={initialProjectId}
      />
      ) : null}
    </div>
  );
}
