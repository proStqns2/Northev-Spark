'use client';

import { useMemo, useState } from 'react';
import {
  Battery,
  Bolt,
  CircuitBoard,
  CircleDot,
  Gauge,
  GitBranch,
  Lightbulb,
  Minus,
  MoveRight,
  PlugZap,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ToggleLeft,
  Triangle,
  Waves,
} from 'lucide-react';
import { COMPONENT_META, ComponentKind } from '@/lib/engine/types';
import { cn } from '@/lib/utils';

const GROUPS: Array<{ id: string; label: string; hint: string; kinds: ComponentKind[] }> = [
  {
    id: 'sources',
    label: 'Sources',
    hint: 'F.é.m. et courants imposés',
    kinds: ['vsource', 'isource', 'vcvs', 'vccs'],
  },
  {
    id: 'passifs',
    label: 'Dipôles passifs',
    hint: 'R, C, L, lampes, réglables',
    kinds: ['resistor', 'capacitor', 'inductor', 'potentiometer', 'lamp'],
  },
  {
    id: 'connexions',
    label: 'Connexions',
    hint: 'Fils et interrupteurs',
    kinds: ['wire', 'switch'],
  },
  {
    id: 'mesure',
    label: 'Mesure',
    hint: 'Appareils de laboratoire',
    kinds: ['ammeter', 'voltmeter'],
  },
];

const ICONS: Record<ComponentKind, React.ComponentType<{ size?: number; className?: string }>> = {
  resistor: Waves,
  capacitor: GitBranch,
  inductor: RotateCcw,
  vsource: Battery,
  isource: Bolt,
  wire: Minus,
  switch: ToggleLeft,
  ammeter: Gauge,
  voltmeter: Gauge,
  lamp: Lightbulb,
  potentiometer: SlidersHorizontal,
  vcvs: Triangle,
  vccs: Triangle,
};

const ACCENT: Record<ComponentKind, string> = {
  resistor: 'text-spark-cyan',
  capacitor: 'text-spark-green',
  inductor: 'text-spark-violet',
  vsource: 'text-spark-amber',
  isource: 'text-spark-blue',
  wire: 'text-fg-mute',
  switch: 'text-fg-soft',
  ammeter: 'text-spark-blue',
  voltmeter: 'text-spark-blue',
  lamp: 'text-spark-amber',
  potentiometer: 'text-spark-pink',
  vcvs: 'text-spark-coral',
  vccs: 'text-spark-coral',
};

export function Palette({
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
  const [openGroup, setOpenGroup] = useState<string | null>('sources');

  const groups = useMemo(() => {
    if (!query.trim()) return GROUPS;
    const q = query.toLowerCase();
    return GROUPS.map((g) => ({
      ...g,
      kinds: g.kinds.filter((k) => {
        const meta = COMPONENT_META[k];
        return meta.label.toLowerCase().includes(q) || meta.symbol.toLowerCase().includes(q);
      }),
    })).filter((g) => g.kinds.length);
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line/60 p-3">
        <label className="flex items-center gap-2 rounded-lg border border-line/60 bg-ink-950/60 px-2.5 py-2 focus-within:border-spark-cyan/50">
          <Search size={14} className="shrink-0 text-fg-mute" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un dipôle…"
            className="w-full bg-transparent text-xs text-fg outline-none placeholder:text-fg-mute/70"
          />
        </label>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {groups.map((group) => {
          const open = query.trim() ? true : openGroup === group.id;
          return (
            <div key={group.id} className="rounded-xl border border-line/40 bg-ink-900/40">
              <button
                type="button"
                onClick={() => setOpenGroup(open ? null : group.id)}
                className="flex w-full items-center justify-between px-2.5 py-2 text-left"
              >
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
                    {group.label}
                  </span>
                  <span className="block text-[10px] text-fg-mute">{group.hint}</span>
                </span>
                <span className={cn('text-fg-mute transition', open && 'rotate-90')}>›</span>
              </button>
              {open ? (
                <div className="grid grid-cols-2 gap-1.5 p-1.5 pt-0">
                  {group.kinds.map((kind) => {
                    const meta = COMPONENT_META[kind];
                    const Icon = ICONS[kind];
                    const active = activeKind === kind && toolMode === 'place';
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => onPick(kind)}
                        title={meta.hint}
                        className={cn(
                          'group flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition',
                          active
                            ? 'border-spark-cyan/70 bg-spark-cyan/10 shadow-glow-sm'
                            : 'border-line/50 bg-ink-850/70 hover:border-line hover:bg-ink-800',
                        )}
                      >
                        <span className="flex w-full items-center justify-between">
                          <Icon size={14} className={ACCENT[kind]} />
                          <span className="font-mono text-[9px] text-fg-mute">{meta.unit || '—'}</span>
                        </span>
                        <span className="text-[10.5px] leading-tight text-fg-soft group-hover:text-fg">
                          {meta.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="mt-2 rounded-xl border border-line/40 bg-ink-900/40 p-1.5">
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
            Repères du montage
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onTerminal('a')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border p-2 text-[10.5px] transition',
                toolMode === 'terminal'
                  ? 'border-spark-cyan/70 bg-spark-cyan/10 text-fg'
                  : 'border-line/50 bg-ink-850/70 text-fg-soft hover:bg-ink-800',
              )}
            >
              <CircleDot size={13} className="text-spark-cyan" /> Borne A
            </button>
            <button
              type="button"
              onClick={() => onTerminal('b')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border p-2 text-[10.5px] transition',
                toolMode === 'terminal'
                  ? 'border-spark-violet/70 bg-spark-violet/10 text-fg'
                  : 'border-line/50 bg-ink-850/70 text-fg-soft hover:bg-ink-800',
              )}
            >
              <CircleDot size={13} className="text-spark-violet" /> Borne B
            </button>
            <button
              type="button"
              onClick={onGround}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border p-2 text-[10.5px] transition',
                toolMode === 'ground'
                  ? 'border-spark-amber/70 bg-spark-amber/10 text-fg'
                  : 'border-line/50 bg-ink-850/70 text-fg-soft hover:bg-ink-800',
              )}
            >
              <PlugZap size={13} className="text-spark-amber" /> Masse
            </button>
            <button
              type="button"
              onClick={onErase}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border p-2 text-[10.5px] transition',
                toolMode === 'erase'
                  ? 'border-spark-coral/70 bg-spark-coral/10 text-fg'
                  : 'border-line/50 bg-ink-850/70 text-fg-soft hover:bg-ink-800',
              )}
            >
              <MoveRight size={13} className="text-spark-coral" /> Effacer
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-line/60 p-2.5">
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-fg-mute">
          <CircuitBoard size={12} className="mt-0.5 shrink-0" />
          Glissez sur la grille pour tracer un dipôle. Chaque broche s’accroche aux nœuds : deux éléments au même point
          sont électriquement connectés.
        </p>
      </div>
    </div>
  );
}
