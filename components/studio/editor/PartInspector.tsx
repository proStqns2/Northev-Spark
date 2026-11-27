'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CircleDot,
  Copy,
  Crosshair,
  Gauge,
  Info,
  RotateCw,
  Trash2,
  ToggleLeft,
  Unplug,
} from 'lucide-react';
import { COMPONENT_META, type CircuitDoc, type Component } from '@/lib/engine/types';
import type { EditorState } from '@/lib/studio/editor';
import { cn } from '@/lib/utils';
import { formatValue } from './EditorCanvas';

/**
 * Inspecteur : tout ce qu'on peut régler sur une pièce, sans quitter le plan.
 *
 * Les valeurs s'écrivent avec un préfixe (`4k7`, `10m`, `2µ2`) : c'est la
 * notation des électroniciens et elle évite d'écrire 0,0000047. Un curseur
 * logarithmique accompagne le champ pour les réglages « au feeling ».
 */

export interface PartInspectorProps {
  state: EditorState;
  onChange: (id: string, patch: Partial<Component>, label?: string) => void;
  onRotate: (id: string) => void;
  onFlip: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onGround: (node: string) => void;
  onTerminal: (which: 'a' | 'b', node: string) => void;
  onRegime: (regime: 'dc' | 'ac', frequency?: number) => void;
  onRename: (name: string) => void;
}

const PRESETS: Record<string, number[]> = {
  resistor: [10, 47, 100, 220, 470, 1000, 2200, 4700, 10000, 47000, 100000],
  capacitor: [1e-12, 4.7e-12, 10e-12, 100e-12, 1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6, 1e-3],
  inductor: [1e-6, 10e-6, 100e-6, 1e-3, 10e-3, 100e-3, 1],
  vsource: [1, 3.3, 5, 9, 12, 15, 24, 48],
  isource: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  potentiometer: [100, 1000, 10000, 100000],
};

export function PartInspector({
  state,
  onChange,
  onRotate,
  onFlip,
  onDuplicate,
  onDelete,
  onGround,
  onTerminal,
  onRegime,
  onRename,
}: PartInspectorProps) {
  const part = state.doc.components.find((item) => item.id === state.selectedId) ?? null;

  return (
    <aside className="flex h-full flex-col gap-2 overflow-y-auto">
      <section className="panel p-2.5">
        <h3 className="text-[10px] uppercase tracking-wide text-fg-mute">Montage</h3>
        <input
          value={state.doc.name}
          onChange={(event) => onRename(event.target.value)}
          className="input mt-1.5 w-full py-1 text-[12px] font-medium"
          aria-label="Nom du montage"
        />
        <div className="mt-2 flex gap-1">
          {(['dc', 'ac'] as const).map((regime) => (
            <button
              key={regime}
              type="button"
              onClick={() => onRegime(regime, state.doc.frequency)}
              className={cn(
                'flex-1 rounded-lg border px-2 py-1 text-[10.5px] transition',
                state.doc.regime === regime
                  ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                  : 'border-line/50 text-fg-soft hover:text-fg',
              )}
            >
              {regime === 'dc' ? 'Continu' : 'Alternatif'}
            </button>
          ))}
        </div>
        {state.doc.regime === 'ac' ? (
          <label className="mt-2 block">
            <span className="flex items-center justify-between text-[10px] text-fg-mute">
              Fréquence d’étude
              <span className="font-mono text-fg-soft">{state.doc.frequency} Hz</span>
            </span>
            <input
              type="range"
              min={10}
              max={2000}
              step={10}
              value={state.doc.frequency}
              onChange={(event) => onRegime('ac', Number(event.target.value))}
              className="mt-1 h-1.5 w-full appearance-none rounded-full bg-ink-700 accent-spark-cyan"
            />
          </label>
        ) : null}
        <p className="mt-2 text-[9.5px] leading-relaxed text-fg-mute">
          Masse : <span className="font-mono text-fg-soft">{state.doc.ground || 'non définie'}</span>
          <br />
          A : <span className="font-mono">{state.doc.terminals.a ?? '—'}</span> · B :{' '}
          <span className="font-mono">{state.doc.terminals.b ?? '—'}</span>
        </p>
      </section>

      {part ? (
        <PartCard
          part={part}
          doc={state.doc}
          onChange={onChange}
          onRotate={onRotate}
          onFlip={onFlip}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onGround={onGround}
          onTerminal={onTerminal}
        />
      ) : (
        <section className="panel p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium">
            <Info size={12} className="text-spark-cyan" /> Aucune pièce sélectionnée
          </p>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-fg-mute">
            Cliquez une pièce sur le plan pour régler sa valeur, la pivoter, la dupliquer ou la supprimer.
          </p>
          <ul className="mt-2 space-y-1 text-[10px] text-fg-soft">
            <li>• Glissez une pièce pour la déplacer (aimantée à la grille).</li>
            <li>• <kbd className="kbd">T</kbd> pivote, <kbd className="kbd">X</kbd> inverse la polarité.</li>
            <li>• <kbd className="kbd">Suppr</kbd> supprime, <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">D</kbd> duplique.</li>
            <li>• Molette : zoom. Espace + glisser : déplacer la vue.</li>
          </ul>
        </section>
      )}
    </aside>
  );
}

function PartCard({
  part,
  doc,
  onChange,
  onRotate,
  onFlip,
  onDuplicate,
  onDelete,
  onGround,
  onTerminal,
}: {
  part: Component;
  doc: CircuitDoc;
  onChange: PartInspectorProps['onChange'];
  onRotate: (id: string) => void;
  onFlip: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onGround: (node: string) => void;
  onTerminal: (which: 'a' | 'b', node: string) => void;
}) {
  const meta = COMPONENT_META[part.kind];
  const [draft, setDraft] = useState(() => formatValue(part.value, ''));

  useEffect(() => {
    setDraft(formatValue(part.value, ''));
  }, [part.id, part.value]);

  const presets = PRESETS[part.kind] ?? [];
  const isSource = part.kind === 'vsource' || part.kind === 'isource';
  const isSwitch = part.kind === 'switch';
  const dependent = part.kind === 'vcvs' || part.kind === 'vccs';

  const bounds = useMemo(() => {
    const base = part.value > 0 ? part.value : 1;
    return { min: base / 50, max: base * 50 };
  }, [part.value]);

  const commitValue = (raw: string) => {
    const parsed = parseSi(raw);
    if (parsed === null) {
      setDraft(formatValue(part.value, ''));
      return;
    }
    onChange(part.id, { value: parsed }, `Valeur de ${part.label ?? meta.label}`);
  };

  return (
    <section className="panel p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11.5px] font-semibold">{part.label ?? meta.label}</p>
          <p className="text-[9.5px] text-fg-mute">{meta.label}</p>
        </div>
        <span className="rounded-md border border-line/60 px-1.5 py-0.5 font-mono text-[9px] text-fg-mute">
          {part.a} → {part.b}
        </span>
      </div>

      {meta.unit ? (
        <>
          <label className="mt-2 block">
            <span className="flex items-center justify-between text-[10px] text-fg-mute">
              Valeur
              <span className="font-mono text-fg-soft">
                {formatValue(part.value, meta.unit)}
              </span>
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => commitValue(draft)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitValue(draft);
                    (event.target as HTMLInputElement).blur();
                  }
                }}
                className="input w-full py-1 font-mono text-[12px]"
                placeholder="4k7"
                aria-label={`Valeur en ${meta.unit}`}
              />
              <span className="shrink-0 rounded-md border border-line/60 px-1.5 py-1 font-mono text-[10px] text-fg-soft">
                {meta.unit}
              </span>
            </div>
            <p className="mt-1 text-[9px] text-fg-mute">
              Notation acceptée : <span className="font-mono">4k7</span>, <span className="font-mono">2µ2</span>,{' '}
              <span className="font-mono">10m</span>
            </p>
          </label>
          <input
            type="range"
            min={Math.log10(bounds.min)}
            max={Math.log10(bounds.max)}
            step={0.01}
            value={Math.log10(Math.max(part.value, bounds.min))}
            onChange={(event) => onChange(part.id, { value: roundSi(10 ** Number(event.target.value)) }, 'Valeur')}
            className="mt-2 h-1.5 w-full appearance-none rounded-full bg-ink-700 accent-spark-cyan"
          />
          {presets.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {presets.slice(0, 8).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange(part.id, { value }, 'Valeur')}
                  className={cn(
                    'rounded border px-1 py-0.5 font-mono text-[9px] transition',
                    Math.abs(part.value - value) / value < 0.01
                      ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                      : 'border-line/50 text-fg-mute hover:text-fg',
                  )}
                >
                  {formatValue(value, '')}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {isSwitch ? (
        <button
          type="button"
          onClick={() => onChange(part.id, { closed: !part.closed }, part.closed ? 'Ouvrir' : 'Fermer')}
          className="btn btn-sm mt-2 w-full border-line/60"
        >
          <ToggleLeft size={12} /> {part.closed ? 'Interrupteur fermé' : 'Interrupteur ouvert'}
        </button>
      ) : null}

      {isSource ? (
        <div className="mt-2 rounded-lg border border-line/50 p-2">
          <p className="text-[9.5px] uppercase tracking-wide text-fg-mute">Composante alternative</p>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-[9px] text-fg-mute">Amplitude</span>
              <input
                type="number"
                value={part.ac?.amplitude ?? part.value}
                onChange={(event) =>
                  onChange(
                    part.id,
                    {
                      ac: {
                        amplitude: Number(event.target.value),
                        frequency: part.ac?.frequency ?? doc.frequency ?? 50,
                        phaseDeg: part.ac?.phaseDeg ?? 0,
                      },
                    },
                    'Amplitude alternative',
                  )
                }
                className="input w-full py-0.5 text-[10.5px]"
              />
            </label>
            <label className="block">
              <span className="text-[9px] text-fg-mute">Fréquence (Hz)</span>
              <input
                type="number"
                value={part.ac?.frequency ?? doc.frequency ?? 50}
                onChange={(event) =>
                  onChange(
                    part.id,
                    {
                      ac: {
                        amplitude: part.ac?.amplitude ?? part.value,
                        frequency: Number(event.target.value),
                        phaseDeg: part.ac?.phaseDeg ?? 0,
                      },
                    },
                    'Fréquence',
                  )
                }
                className="input w-full py-0.5 text-[10.5px]"
              />
            </label>
          </div>
          <p className="mt-1 text-[9px] text-fg-mute">Vide = continu pur.</p>
        </div>
      ) : null}

      {dependent ? (
        <label className="mt-2 block">
          <span className="flex items-center justify-between text-[10px] text-fg-mute">
            Gain (sans unité)
            <span className="font-mono text-fg-soft">{part.gain ?? 2}</span>
          </span>
          <input
            type="number"
            step={0.5}
            value={part.gain ?? 2}
            onChange={(event) => onChange(part.id, { gain: Number(event.target.value) }, 'Gain')}
            className="input mt-1 w-full py-0.5 text-[10.5px]"
          />
        </label>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-1">
        <SmallButton onClick={() => onRotate(part.id)} icon={<RotateCw size={11} />} label="Pivoter" />
        <SmallButton onClick={() => onFlip(part.id)} icon={<ArrowLeftRight size={11} />} label="Inverser" />
        <SmallButton onClick={() => onDuplicate(part.id)} icon={<Copy size={11} />} label="Dupliquer" />
        <SmallButton onClick={() => onDelete(part.id)} icon={<Trash2 size={11} />} label="Supprimer" danger />
      </div>

      <div className="mt-2 space-y-1 border-t border-line/40 pt-2">
        <div className="grid grid-cols-2 gap-1">
          <SmallButton onClick={() => onGround(part.a)} icon={<CircleDot size={11} />} label="Masse = A" />
          <SmallButton onClick={() => onGround(part.b)} icon={<CircleDot size={11} />} label="Masse = B" />
          <SmallButton onClick={() => onTerminal('a', part.a)} icon={<Crosshair size={11} />} label="Borne A" />
          <SmallButton onClick={() => onTerminal('b', part.b)} icon={<Crosshair size={11} />} label="Borne B" />
        </div>
        <p className="flex items-start gap-1 text-[9px] leading-relaxed text-fg-mute">
          <Unplug size={10} className="mt-0.5 shrink-0" />
          {meta.hint}
        </p>
      </div>
    </section>
  );
}

function SmallButton({
  onClick,
  icon,
  label,
  danger = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1 rounded-lg border px-1.5 py-1 text-[9.5px] transition',
        danger
          ? 'border-spark-rose/40 text-spark-rose hover:bg-spark-rose/10'
          : 'border-line/50 text-fg-soft hover:border-line hover:text-fg',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Analyse une valeur à la notation électronicienne : `4k7` = 4700,
 * `2µ2` = 2,2·10⁻⁶, `10m` = 0,01, `1M` = 10⁶. Une virgule est acceptée.

 */
export function parseSi(raw: string): number | null {
  const text = raw.trim().replace(',', '.').replace(/\s/g, '');
  if (!text) return null;
  const match = /^([+-]?\d*\.?\d+)([pnuµmkKMGR]?)(\d*)$/.exec(text);
  if (!match) {
    const direct = Number(text);
    return Number.isFinite(direct) ? direct : null;
  }
  const [, head, prefix, tail] = match;
  const combined = tail ? `${head}.${tail}` : head;
  const value = Number(combined);
  if (!Number.isFinite(value)) return null;
  const scale: Record<string, number> = {
    '': 1,
    p: 1e-12,
    n: 1e-9,
    u: 1e-6,
    µ: 1e-6,
    m: 1e-3,
    k: 1e3,
    K: 1e3,
    M: 1e6,
    G: 1e9,
    R: 1,
  };
  return value * (scale[prefix] ?? 1);
}

function roundSi(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const factor = 10 ** Math.max(0, exponent - 2);
  return Math.round(value / factor) * factor;
}
