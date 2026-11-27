'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Battery,
  Cable,
  CircleDot,
  Gauge,
  Hand,
  Lamp,
  MousePointer2,
  Move3d,
  Search,
  SlidersHorizontal,
  Trash2,
  ToggleLeft,
  Waves,
  Zap,
} from 'lucide-react';
import { COMPONENT_META, type ComponentKind } from '@/lib/engine/types';
import type { Tool } from '@/lib/studio/editor';
import { cn } from '@/lib/utils';

/**
 * Palette de l'atelier.
 *
 * Trois sections :
 *  - outils (sélection, fil, gomme, masse, bornes) ;
 *  - familles de dipôles, avec recherche et glisser-déposer ;
 *  - gabarits de départ.
 *
 * Le clic arme un outil, le glisser-déposer pose directement sur le plan :
 * deux façons de faire, parce que les habitudes diffèrent.
 */

const KIND_ICON: Partial<Record<ComponentKind, typeof Zap>> = {
  resistor: SlidersHorizontal,
  capacitor: CircleDot,
  inductor: Waves,
  vsource: Battery,
  isource: Zap,
  wire: Cable,
  switch: ToggleLeft,
  ammeter: Gauge,
  voltmeter: Gauge,
  lamp: Lamp,
  potentiometer: Move3d,
  vcvs: ArrowUpRight,
  vccs: ArrowUpRight,
};

const GROUPS: Array<{ id: 'sources' | 'passifs' | 'connexions' | 'mesure' | 'liees'; label: string }> = [
  { id: 'sources', label: 'Sources' },
  { id: 'passifs', label: 'Passifs' },
  { id: 'connexions', label: 'Connexions' },
  { id: 'mesure', label: 'Mesure' },
  { id: 'liees', label: 'Sources liées' },
];

const SHORTCUT: Partial<Record<ComponentKind, string>> = {
  resistor: 'R',
  capacitor: 'C',
  inductor: 'L',
  vsource: 'E',
  isource: 'I',
  switch: 'K',
  ammeter: 'A',
  voltmeter: 'G',
  potentiometer: 'P',
  lamp: 'H',
};

export interface PartPaletteProps {
  tool: Tool;
  onTool: (tool: Tool) => void;
  templates?: Array<{ slug: string; title: string; components: number }>;
  onTemplate?: (slug: string) => void;
  compact?: boolean;
}

export function PartPalette({ tool, onTool, templates = [], onTemplate, compact = false }: PartPaletteProps) {
  const [query, setQuery] = useState('');
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const kinds = useMemo(() => {
    const all = (Object.keys(COMPONENT_META) as ComponentKind[]).filter((kind) => kind !== 'wire');
    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    return all.filter((kind) => {
      const meta = COMPONENT_META[kind];
      return `${meta.label} ${meta.symbol} ${meta.hint}`.toLowerCase().includes(needle);
    });
  }, [query]);

  const tools: Array<{ id: string; label: string; icon: typeof Zap; active: boolean; onClick: () => void; hint: string }> = [
    {
      id: 'select',
      label: 'Sélection',
      icon: MousePointer2,
      active: tool.mode === 'select',
      onClick: () => onTool({ mode: 'select' }),
      hint: 'V',
    },
    { id: 'wire', label: 'Fil', icon: Cable, active: tool.mode === 'wire', onClick: () => onTool({ mode: 'wire' }), hint: 'W' },
    { id: 'erase', label: 'Gomme', icon: Trash2, active: tool.mode === 'erase', onClick: () => onTool({ mode: 'erase' }), hint: 'Suppr' },
    { id: 'ground', label: 'Masse', icon: CircleDot, active: tool.mode === 'ground', onClick: () => onTool({ mode: 'ground' }), hint: 'M' },
    {
      id: 'terminal-a',
      label: 'Borne A',
      icon: ArrowUpRight,
      active: tool.mode === 'terminal' && tool.which === 'a',
      onClick: () => onTool({ mode: 'terminal', which: 'a' }),
      hint: '',
    },
    {
      id: 'terminal-b',
      label: 'Borne B',
      icon: ArrowUpRight,
      active: tool.mode === 'terminal' && tool.which === 'b',
      onClick: () => onTool({ mode: 'terminal', which: 'b' }),
      hint: '',
    },
    { id: 'pan', label: 'Vue', icon: Hand, active: tool.mode === 'pan', onClick: () => onTool({ mode: 'pan' }), hint: 'Espace' },
  ];

  return (
    <aside className={cn('flex h-full flex-col gap-2', compact && 'gap-1.5')}>
      <section className="panel p-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] uppercase tracking-wide text-fg-mute">Outils</h3>
          <span className="text-[9px] text-fg-mute">clavier</span>
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {tools.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                title={`${item.label}${item.hint ? ` (${item.hint})` : ''}`}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[9px] transition',
                  item.active
                    ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                    : 'border-line/50 text-fg-soft hover:border-line hover:text-fg',
                )}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel flex min-h-0 flex-1 flex-col p-2">
        <div className="relative">
          <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-mute" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher (résistance, source…)"
            className="input w-full py-1.5 pl-7 text-[11px]"
            aria-label="Chercher un dipôle"
          />
        </div>

        <p className="mt-1 px-1 text-[9px] leading-snug text-fg-mute">
          Clic = poser une pièce · Maj + clic = en poser plusieurs
        </p>

        <div className="mt-1 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {GROUPS.map((group) => {
            const items = kinds.filter((kind) => COMPONENT_META[kind].group === group.id);
            if (!items.length) return null;
            const collapsed = openGroup !== null && openGroup !== group.id;
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                  className="flex w-full items-center justify-between px-1 text-[9.5px] uppercase tracking-wide text-fg-mute hover:text-fg-soft"
                >
                  {group.label}
                  <span>{collapsed ? '+' : '–'}</span>
                </button>
                {collapsed ? null : (
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    {items.map((kind) => {
                      const meta = COMPONENT_META[kind];
                      const Icon = KIND_ICON[kind] ?? Zap;
                      const active = tool.mode === 'place' && tool.kind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/x-spark-kind', kind);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => onTool({ mode: 'place', kind })}
                          title={`${meta.label} — ${meta.hint}`}
                          className={cn(
                            'group flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-left transition',
                            active
                              ? 'border-spark-cyan/60 bg-spark-cyan/10 text-fg'
                              : 'border-line/50 text-fg-soft hover:border-line hover:bg-ink-850',
                          )}
                        >
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                            style={{ background: `${meta.color}18`, color: meta.color }}
                          >
                            <Icon size={12} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[10.5px] font-medium leading-tight">{meta.label}</span>
                            <span className="block text-[9px] leading-tight text-fg-mute">
                              {meta.symbol} · {meta.unit || '—'}
                            </span>
                          </span>
                          {SHORTCUT[kind] ? (
                            <kbd className="hidden rounded border border-line/60 px-1 text-[8.5px] text-fg-mute group-hover:inline">
                              {SHORTCUT[kind]}
                            </kbd>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {kinds.length === 0 ? (
            <p className="px-1 py-3 text-[10.5px] text-fg-mute">Aucun dipôle ne correspond à « {query} ».</p>
          ) : null}
        </div>
      </section>

      {templates.length > 0 && onTemplate ? (
        <section className="panel p-2">
          <h3 className="px-1 text-[10px] uppercase tracking-wide text-fg-mute">Partir d’un exemple</h3>
          <div className="mt-1.5 space-y-1">
            {templates.slice(0, compact ? 3 : 5).map((template) => (
              <button
                key={template.slug}
                type="button"
                onClick={() => onTemplate(template.slug)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-line/40 px-2 py-1 text-left text-[10.5px] text-fg-soft transition hover:border-spark-cyan/40 hover:text-fg"
              >
                <span className="truncate">{template.title}</span>
                <span className="shrink-0 font-mono text-[9px] text-fg-mute">{template.components} pièces</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
