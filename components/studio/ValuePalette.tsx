'use client';

import { useMemo, useState } from 'react';
import { Bolt, Check, Edit3, Hash } from 'lucide-react';
import { COMPONENT_META, Component, ComponentKind } from '@/lib/engine/types';
import { formatSI } from '@/lib/engine/format';
import { cn } from '@/lib/utils';

/**
 * Panneau des valeurs — saisie directe de R, L, C, E, I₀ par l'utilisateur.
 *
 * Deux usages :
 *  1. avant tout placement : on choisit le composant ET sa valeur, puis il
 *     suffit de cliquer deux nœuds sur la grille ;
 *  2. après un placement : la valeur par défaut est remplacée par celle saisie.
 *
 * Chaque ligne propose la valeur du dipôle, ses préfixes SI (m, µ, n, p) et
 * des valeurs usuelles en un clic.
 */

export interface DraftValue {
  kind: ComponentKind;
  value: number;
}

const ROWS: Array<{
  kind: ComponentKind;
  letter: string;
  unitLabel: string;
  presets: number[];
  scales: Array<{ factor: number; label: string }>;
}> = [
  {
    kind: 'resistor',
    letter: 'R',
    unitLabel: 'Ω',
    presets: [10, 100, 470, 1000, 2200, 10000],
    scales: [
      { factor: 1, label: 'Ω' },
      { factor: 1e3, label: 'kΩ' },
      { factor: 1e6, label: 'MΩ' },
    ],
  },
  {
    kind: 'inductor',
    letter: 'L',
    unitLabel: 'H',
    presets: [1e-3, 10e-3, 47e-3, 100e-3, 1],
    scales: [
      { factor: 1e-3, label: 'mH' },
      { factor: 1e-6, label: 'µH' },
      { factor: 1, label: 'H' },
    ],
  },
  {
    kind: 'capacitor',
    letter: 'C',
    unitLabel: 'F',
    presets: [1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6],
    scales: [
      { factor: 1e-9, label: 'nF' },
      { factor: 1e-6, label: 'µF' },
      { factor: 1e-3, label: 'mF' },
    ],
  },
  {
    kind: 'vsource',
    letter: 'E',
    unitLabel: 'V',
    presets: [3.3, 5, 9, 12, 24, 230],
    scales: [{ factor: 1, label: 'V' }],
  },
  {
    kind: 'isource',
    letter: 'I₀',
    unitLabel: 'A',
    presets: [1e-3, 10e-3, 50e-3, 0.1, 1, 2],
    scales: [
      { factor: 1e-3, label: 'mA' },
      { factor: 1e-6, label: 'µA' },
      { factor: 1, label: 'A' },
    ],
  },
];

export function ValuePalette({
  draft,
  onDraft,
  activeKind,
  onPick,
  components,
  onEditComponent,
}: {
  draft: Record<string, number>;
  onDraft: (kind: ComponentKind, value: number) => void;
  activeKind: ComponentKind | null;
  onPick: (kind: ComponentKind) => void;
  /** dipôles déjà posés, pour l'édition rapide */
  components: Component[];
  onEditComponent: (id: string, value: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const placed = useMemo(
    () => components.filter((c) => ['resistor', 'inductor', 'capacitor', 'vsource', 'isource'].includes(c.kind)),
    [components],
  );

  return (
    <div className="flex h-full flex-col bg-[#0a1420]">
      <div className="border-b border-line/60 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-mute">Valeurs des dipôles</p>
        <p className="mt-0.5 text-[9.5px] leading-snug text-fg-mute/80">
          Saisissez la valeur, choisissez le composant, puis cliquez deux nœuds.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ROWS.map((row) => {
          const meta = COMPONENT_META[row.kind];
          const active = activeKind === row.kind;
          const current = draft[row.kind] ?? meta.defaultValue;
          const scale =
            row.scales.find((s) => Math.abs(current) >= s.factor && Math.abs(current) < s.factor * 1000) ??
            row.scales[0];

          return (
            <section
              key={row.kind}
              className={cn(
                'border-b border-line/40 px-2.5 py-2 transition',
                active && 'bg-spark-cyan/[0.07]',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-[9.5px] font-bold"
                  style={{
                    color: meta.color,
                    borderColor: `${meta.color}55`,
                    background: `${meta.color}14`,
                  }}
                >
                  {row.letter}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium text-fg-soft">
                  {meta.label}
                </span>
                {active ? (
                  <span className="flex items-center gap-0.5 rounded bg-spark-cyan/15 px-1 py-0.5 text-[8px] font-semibold uppercase text-spark-cyan">
                    <Check size={8} /> actif
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onPick(row.kind)}
                  className="shrink-0 rounded border border-line/50 px-1 py-[1px] text-[8.5px] font-medium text-fg-mute transition hover:border-spark-cyan/50 hover:text-spark-cyan"
                  aria-label={`Choisir ${meta.label} et le poser sur la grille`}
                >
                  poser
                </button>
              </div>

              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  step="any"
                  value={Number((current / scale.factor).toPrecision(8))}
                  onChange={(e) => {
                    const next = Number(e.target.value) * scale.factor;
                    if (Number.isFinite(next) && next > 0) onDraft(row.kind, next);
                  }}
                  className="field min-w-0 flex-1 py-0.5 font-mono text-[11px]"
                  aria-label={`Valeur de ${meta.label}`}
                />
                <select
                  value={scale.factor}
                  onChange={(e) => {
                    const factor = Number(e.target.value);
                    onDraft(row.kind, Number(((current * factor) / scale.factor).toPrecision(6)));
                  }}
                  className="field w-[58px] shrink-0 py-0.5 px-1 text-[10px]"
                  aria-label={`Préfixe de ${meta.label}`}
                >
                  {row.scales.map((s) => (
                    <option key={s.factor} value={s.factor}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {row.presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onDraft(row.kind, preset)}
                    className={cn(
                      'rounded border px-1 py-[1px] font-mono text-[8.5px] transition',
                      Math.abs(current - preset) / preset < 1e-6
                        ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                        : 'border-line/40 text-fg-mute hover:border-line hover:text-fg-soft',
                    )}
                  >
                    {formatSI(preset, row.unitLabel, { digits: 2, space: false })}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {/* -------------------------------------- dipôles déjà posés */}
        {placed.length ? (
          <section className="border-t border-line/50">
            <div className="flex items-center justify-between px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">Sur la grille</p>
              <span className="rounded border border-line/50 px-1.5 py-0.5 font-mono text-[9px] text-fg-mute">
                {placed.length}
              </span>
            </div>
            <ul className="max-h-[190px] overflow-y-auto px-2 pb-2">
              {placed.map((component) => {
                const meta = COMPONENT_META[component.kind];
                const isEditing = editing === component.id;
                return (
                  <li
                    key={component.id}
                    className="mb-1 flex items-center gap-1.5 rounded-md border border-line/40 bg-ink-900/60 px-1.5 py-1"
                  >
                    <span className="w-9 shrink-0 truncate font-mono text-[9.5px] text-fg-soft">
                      {component.label ?? component.id}
                    </span>
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          type="number"
                          step="any"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const next = Number(editingValue);
                              if (Number.isFinite(next) && next > 0) onEditComponent(component.id, next);
                              setEditing(null);
                            }
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          className="min-w-0 flex-1 rounded border border-spark-cyan/50 bg-ink-950 px-1 py-0.5 font-mono text-[10px] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = Number(editingValue);
                            if (Number.isFinite(next) && next > 0) onEditComponent(component.id, next);
                            setEditing(null);
                          }}
                          className="shrink-0 text-spark-green"
                          aria-label="Valider"
                        >
                          <Check size={11} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-fg-mute">
                          {formatSI(component.value, meta.unit, { digits: 3, space: false })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(component.id);
                            setEditingValue(String(component.value));
                          }}
                          className="shrink-0 text-fg-mute hover:text-spark-cyan"
                          aria-label={`Modifier ${component.id}`}
                        >
                          <Edit3 size={10} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <div className="px-3 py-4 text-center">
            <Bolt size={14} className="mx-auto text-fg-mute/60" />
            <p className="mt-1 text-[9.5px] leading-snug text-fg-mute/80">
              Aucun dipôle sur la grille. Choisissez-en un ci-dessus puis cliquez deux nœuds.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-line/60 px-3 py-1.5">
        <p className="flex items-center gap-1 text-[9px] text-fg-mute/80">
          <Hash size={9} /> Les valeurs s’appliquent au prochain dipôle posé
        </p>
      </div>
    </div>
  );
}
