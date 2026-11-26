'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Compass,
  Filter,
  GraduationCap,
  Search,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react';
import { TileGlyph } from '@/components/marketing/TileGlyph';
import { CircuitThumbnail } from '@/components/studio/CircuitCanvas';
import { CircuitDoc, ComponentKind } from '@/lib/engine/types';
import { FAMILY_LABEL } from '@/lib/data/templates';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

type Family = keyof typeof FAMILY_LABEL;

interface Item {
  slug: string;
  title: string;
  subtitle: string;
  family: string;
  accent: string;
  shape: string;
  difficulty: string;
  regime: 'dc' | 'ac';
  summary: string;
  teaching: string[];
  componentCount: number;
  expected: { vth: string; rth: string; inorton: string; status: string } | null;
  preview: string;
}

const FAMILIES = Object.keys(FAMILY_LABEL) as Family[];

const GLYPH: Record<string, ComponentKind> = {
  'thevenin-norton': 'vsource',
  impedances: 'inductor',
  dipoles: 'resistor',
  sources: 'isource',
  ponts: 'resistor',
  labo: 'resistor',
};

export function BibliothequeClient({ templates }: { templates: Item[] }) {
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState<Family | 'all'>('all');
  const [regime, setRegime] = useState<'all' | 'dc' | 'ac'>('all');
  const [difficulty, setDifficulty] = useState<'all' | string>('all');
  const [hovered, setHovered] = useState<string | null>(null);
  const router = useRouter();
  const { info } = useToast();

  const filtered = useMemo(
    () =>
      templates.filter((t) => {
        if (family !== 'all' && t.family !== family) return false;
        if (regime !== 'all' && t.regime !== regime) return false;
        if (difficulty !== 'all' && t.difficulty !== difficulty) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q) ||
          t.teaching.some((x) => x.toLowerCase().includes(q))
        );
      }),
    [templates, query, family, regime, difficulty],
  );

  const hoveredDoc = useMemo(() => {
    const item = templates.find((t) => t.slug === hovered);
    if (!item) return null;
    try {
      return JSON.parse(item.preview) as CircuitDoc;
    } catch {
      return null;
    }
  }, [hovered, templates]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <span className="chip border-spark-cyan/40 bg-spark-cyan/[0.08] text-spark-cyan">
            <GraduationCap size={12} /> {templates.length} montages de référence
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Bibliothèque de montages
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-soft">
            Chaque fiche est un montage exécutable : les valeurs affichées (U_th, Z_th, I_N) sont recalculées par le
            moteur à partir des composants réels. Ouvrez-la pour l’éditer, ou dupliquez-la dans votre historique.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/studio" className="btn">
            <Zap size={14} /> Studio vierge
          </Link>
          <Link href="/premium" className="btn border-spark-violet/40 bg-spark-violet/10 text-spark-violet">
            <Sparkles size={14} /> Agents IA
          </Link>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-line/60 bg-ink-900/70 px-3 py-2 focus-within:border-spark-cyan/50">
          <Search size={15} className="text-fg-mute" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher un montage, une loi (Millman, RLC, Wheatstone…)"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-fg-mute/70"
          />
        </label>
        <div className="flex items-center gap-1 rounded-xl border border-line/60 bg-ink-900/70 p-1">
          {(['all', 'dc', 'ac'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRegime(mode)}
              className={cn(
                'rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition',
                regime === mode ? 'bg-ink-700 text-fg' : 'text-fg-mute hover:text-fg',
              )}
            >
              {mode === 'all' ? 'Tous régimes' : mode === 'dc' ? 'Continu' : 'Sinusoïdal'}
            </button>
          ))}
        </div>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="rounded-xl border border-line/60 bg-ink-900/70 px-3 py-2.5 text-[12px] text-fg-soft outline-none focus:border-spark-cyan/50"
          aria-label="Niveau"
        >
          <option value="all">Tous niveaux</option>
          <option value="Découverte">Découverte</option>
          <option value="Intermédiaire">Intermédiaire</option>
          <option value="Avancé">Avancé</option>
        </select>
      </div>

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <span className="flex shrink-0 items-center gap-1 pr-1 text-[10px] uppercase tracking-wider text-fg-mute">
          <Filter size={11} /> Famille
        </span>
        <button
          type="button"
          onClick={() => setFamily('all')}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-[11px] transition',
            family === 'all'
              ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
              : 'border-line/60 text-fg-mute hover:text-fg',
          )}
        >
          Tout ({templates.length})
        </button>
        {FAMILIES.map((key) => {
          const count = templates.filter((t) => t.family === key).length;
          if (!count) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFamily(key)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-[11px] transition',
                family === key
                  ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                  : 'border-line/60 text-fg-mute hover:text-fg',
              )}
            >
              {FAMILY_LABEL[key]} ({count})
            </button>
          );
        })}
      </div>

      {hoveredDoc ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-spark-cyan/30 bg-ink-900/70">
          <div className="flex items-center justify-between border-b border-line/50 px-3 py-1.5">
            <p className="font-mono text-[10px] text-spark-cyan">aperçu · {hoveredDoc.name}</p>
            <span className="font-mono text-[10px] text-fg-mute">{hoveredDoc.components.length} dipôles</span>
          </div>
          <div className="h-[190px] canvas-grid">
            <CircuitThumbnail doc={hoveredDoc} />
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <article
            key={item.slug}
            onMouseEnter={() => setHovered(item.slug)}
            onMouseLeave={() => setHovered((h) => (h === item.slug ? null : h))}
            className="group panel card-hover flex flex-col overflow-hidden"
          >
            <div className="relative flex h-[124px] items-center justify-center border-b border-line/50 bg-ink-950/50">
              <TileGlyph
                shape={item.shape as 'circle' | 'hex' | 'shield' | 'badge'}
                accent={item.accent as 'cyan'}
                kind={GLYPH[item.family] ?? 'resistor'}
                size={88}
              />
              <span className="absolute left-2 top-2 rounded border border-line/60 bg-ink-900/80 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-fg-mute">
                {item.regime}
              </span>
              <span className="absolute right-2 top-2 rounded-full border border-line/60 px-2 py-0.5 text-[9px] text-fg-soft">
                {item.difficulty}
              </span>
            </div>

            <div className="flex flex-1 flex-col p-3.5">
              <h2 className="text-[14px] font-semibold leading-tight">{item.title}</h2>
              <p className="text-[11px] text-fg-mute">{item.subtitle}</p>
              <p className="mt-2 line-clamp-3 text-[11.5px] leading-relaxed text-fg-soft">{item.summary}</p>

              <ul className="mt-2.5 flex flex-wrap gap-1">
                {item.teaching.slice(0, 2).map((law) => (
                  <li
                    key={law}
                    className="rounded border border-line/50 bg-ink-850/70 px-1.5 py-0.5 font-mono text-[9px] text-fg-mute"
                  >
                    {law}
                  </li>
                ))}
              </ul>

              {item.expected ? (
                <div className="mt-3 grid grid-cols-3 gap-1 border-t border-line/40 pt-2.5 font-mono text-[9.5px]">
                  <div>
                    <p className="text-fg-mute">U_th</p>
                    <p className="text-spark-cyan">{item.expected.vth}</p>
                  </div>
                  <div>
                    <p className="text-fg-mute">Z_th</p>
                    <p className="text-spark-violet">{item.expected.rth}</p>
                  </div>
                  <div>
                    <p className="text-fg-mute">I_N</p>
                    <p className="text-spark-amber">{item.expected.inorton}</p>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-1.5">
                <Link
                  href={`/studio?template=${item.slug}`}
                  className="btn btn-sm flex-1 border-spark-cyan/40 bg-spark-cyan/[0.08] text-spark-cyan hover:border-spark-cyan/70"
                >
                  <Compass size={12} /> Ouvrir dans le studio
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/studio?template=${item.slug}`);
                    info('Gabarit chargé', 'Modifiez-le puis enregistrez pour l’ajouter à votre historique.');
                  }}
                  className="btn btn-sm"
                  title="Dupliquer dans le studio"
                >
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {!filtered.length ? (
        <div className="panel mt-6 flex flex-col items-center gap-2 p-10 text-center">
          <Waves size={22} className="text-fg-mute" />
          <p className="text-sm font-medium">Aucun montage ne correspond à ces filtres.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFamily('all');
              setRegime('all');
              setDifficulty('all');
            }}
            className="btn btn-sm mt-1"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : null}
    </div>
  );
}
