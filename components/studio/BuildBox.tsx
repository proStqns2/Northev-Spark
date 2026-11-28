'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, CircleDot, PlugZap, Search, Trash2, X } from 'lucide-react';
import { COMPONENT_META, ComponentKind } from '@/lib/engine/types';
import { KIND_COLORS } from '@/lib/studio/symbolSvg';
import { NormSymbolTile } from '@/components/studio/symbols/NormSymbol';
import { cn } from '@/lib/utils';

/**
 * Build Box — palette de construction reprenant la disposition du manuel :
 * groupes titrés (Sources idéales, Éléments passifs, Sources de signal,
 * Amplificateurs opérationnels, Diodes…), tuiles carrées à grand symbole.
 *
 * Chaque tuile montre le symbole normalisé réel (le même SVG que sur la
 * grille), donc ce que l'on clique est exactement ce que l'on place.
 */

interface Group {
  id: string;
  label: string;
  kinds: ComponentKind[];
  accent: string;
}

const GROUPS: Group[] = [
  {
    id: 'essential',
    label: 'Essentiels',
    kinds: ['wire', 'ammeter', 'voltmeter'],
    accent: '#9fb6d6',
  },
  {
    id: 'ideal',
    label: 'Sources idéales',
    kinds: ['vsource', 'isource'],
    accent: '#ffc266',
  },
  {
    id: 'passive',
    label: 'Éléments passifs',
    kinds: ['resistor', 'capacitor', 'inductor'],
    accent: '#38e1e6',
  },
  {
    id: 'signal',
    label: 'Sources de signal',
    kinds: ['vcvs', 'vccs'],
    accent: '#ff9b6b',
  },
  {
    id: 'rest',
    label: 'Charge & réglage',
    kinds: ['lamp', 'potentiometer', 'switch'],
    accent: '#ff79c6',
  },
];

const SHORT: Partial<Record<ComponentKind, string>> = {
  wire: 'Fil',
  ammeter: 'Ampèremètre',
  voltmeter: 'Voltmètre',
  vsource: 'Tension E',
  isource: 'Courant i',
  resistor: 'Résistance R',
  capacitor: 'Condensateur C',
  inductor: 'Bobine L',
  vcvs: 'Source μ',
  vccs: 'Source g',
  lamp: 'Lampe',
  potentiometer: 'Potentiomètre',
  switch: 'Interrupteur',
};

export function BuildBox({
  onPick,
  activeKind,
  onTerminal,
  onGround,
  onErase,
  toolMode,
}: {
  onPick: (kind: ComponentKind) => void;
  activeKind: ComponentKind | null;
  onTerminal: (which: 'a' | 'b') => void;
  onGround: () => void;
  onErase: () => void;
  toolMode: string;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    if (!query.trim()) return GROUPS;
    const q = query.toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      kinds: g.kinds.filter((k) => {
        const meta = COMPONENT_META[k];
        return (
          meta.label.toLowerCase().includes(q) ||
          meta.symbol.toLowerCase().includes(q) ||
          (SHORT[k] ?? '').toLowerCase().includes(q)
        );
      }),
    })).filter((g) => g.kinds.length);
  }, [query]);

  return (
    <div className="flex h-full flex-col bg-[#0a1420]">
      {/* ------------------------------------------------------- en-tête */}
      <div className="border-b border-line/60 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-mute">Build Box</p>
          <span className="rounded border border-line/50 px-1.5 py-0.5 font-mono text-[9px] text-fg-mute">
            {GROUPS.reduce((n, g) => n + g.kinds.length, 0)} dipôles
          </span>
        </div>
        <label className="mt-2 flex items-center gap-2 rounded-lg border border-line/60 bg-ink-950/70 px-2.5 py-1.5 focus-within:border-spark-cyan/50">
          <Search size={13} className="shrink-0 text-fg-mute" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher : R, L, C, E, i…"
            className="w-full bg-transparent text-[11.5px] text-fg outline-none placeholder:text-fg-mute/70"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Effacer" className="text-fg-mute">
              <X size={12} />
            </button>
          ) : null}
        </label>
      </div>

      {/* ------------------------------------------------------- groupes */}
      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const open = query.trim() ? true : !collapsed[group.id];
          return (
            <section key={group.id}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))}
                className="flex w-full items-center justify-between border-y border-line/40 bg-ink-950/70 px-3 py-1.5 text-left"
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: group.accent }}>
                  {group.label}
                </span>
                <ChevronDown
                  size={12}
                  className={cn('text-fg-mute transition', !open && '-rotate-90')}
                />
              </button>

              {open ? (
                <div className="grid grid-cols-3 gap-1 p-1.5">
                  {group.kinds.map((kind) => {
                    const meta = COMPONENT_META[kind];
                    const color = KIND_COLORS[kind];
                    const active = activeKind === kind && toolMode === 'place';
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => onPick(kind)}
                        title={`${meta.label} — ${meta.hint}`}
                        className={cn(
                          'group relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-[5px] border transition',
                          active
                            ? 'border-spark-cyan bg-spark-cyan/10 shadow-glow-sm'
                            : 'border-line/50 bg-gradient-to-b from-[#16283b] to-[#0f1d2b] hover:border-spark-cyan/50 hover:from-[#1a3049]',
                        )}
                      >
                        <NormSymbolTile kind={kind} color={active ? '#9df3f6' : color} size={34} />
                        <span className="w-full truncate px-0.5 text-center text-[8.5px] leading-none text-fg-mute group-hover:text-fg-soft">
                          {SHORT[kind] ?? meta.label}
                        </span>
                        {active ? (
                          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-spark-cyan" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}

        {!groups.length ? (
          <p className="px-3 py-6 text-center text-[11px] text-fg-mute">Aucun dipôle ne correspond à « {query} ».</p>
        ) : null}

        {/* ------------------------------------------------- repères */}
        <section>
          <div className="border-y border-line/40 bg-ink-950/70 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-spark-violet">
              Repères du montage
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {(
              [
                { id: 'a', label: 'Borne A', color: '#38e1e6', icon: CircleDot },
                { id: 'b', label: 'Borne B', color: '#a479ff', icon: CircleDot },
                { id: 'gnd', label: 'Masse', color: '#ffc266', icon: PlugZap },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active =
                item.id === 'gnd' ? toolMode === 'ground' : toolMode === 'terminal';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (item.id === 'gnd' ? onGround() : onTerminal(item.id as 'a' | 'b'))}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-1 rounded-[5px] border transition',
                    active
                      ? 'border-spark-cyan/70 bg-spark-cyan/10'
                      : 'border-line/50 bg-gradient-to-b from-[#16283b] to-[#0f1d2b] hover:border-line',
                  )}
                >
                  <Icon size={15} style={{ color: item.color }} />
                  <span className="text-[8.5px] leading-none text-fg-mute">{item.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------ outils */}
      <div className="border-t border-line/60 p-1.5">
        <button
          type="button"
          onClick={onErase}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-[10.5px] transition',
            toolMode === 'erase'
              ? 'border-spark-coral/70 bg-spark-coral/10 text-spark-coral'
              : 'border-line/50 text-fg-mute hover:border-line hover:text-fg-soft',
          )}
        >
          <Trash2 size={12} /> Gomme (E)
        </button>
        <p className="mt-1 px-1 text-center text-[9px] leading-tight text-fg-mute/80">
          Cliquez une tuile puis deux nœuds de la grille
        </p>
      </div>
    </div>
  );
}
