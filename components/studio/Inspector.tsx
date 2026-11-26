'use client';

import { useState } from 'react';
import {
  ArrowDownUp,
  CircleSlash,
  Copy,
  Gauge,
  Info,
  Link2,
  RotateCw,
  Trash2,
  Zap,
} from 'lucide-react';
import { COMPONENT_META, CircuitDoc, Component } from '@/lib/engine/types';
import { formatSI, rawNumber } from '@/lib/engine/format';
import { Reading } from '@/lib/engine/solver';
import { orientationOf, pointToCell } from '@/lib/studio/geometry';
import { cn } from '@/lib/utils';

const PRESETS: Record<string, number[]> = {
  resistor: [10, 47, 100, 220, 470, 1000, 2200, 4700, 10000, 47000, 100000],
  potentiometer: [1000, 10000, 47000, 100000, 1000000],
  capacitor: [10e-12, 100e-12, 1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6, 1e-3],
  inductor: [1e-3, 10e-3, 47e-3, 100e-3, 220e-3, 470e-3, 1, 2.2],
  lamp: [12, 24, 60, 100, 220, 470],
  vsource: [1, 3.3, 5, 9, 12, 15, 24, 48],
  isource: [1e-3, 5e-3, 10e-3, 20e-3, 50e-3, 0.1, 0.5, 1],
};

const UNIT_SUFFIX: Record<string, string> = {
  resistor: 'Ω',
  potentiometer: 'Ω',
  capacitor: 'F',
  inductor: 'H',
  vsource: 'V',
  isource: 'A',
  lamp: 'Ω',
  vcvs: 'V/V',
  vccs: 'A/V',
};

export function Inspector({
  doc,
  selected,
  reading,
  onChange,
  onDelete,
  onDuplicate,
  onRotate,
  onFlip,
  digits,
}: {
  doc: CircuitDoc;
  selected: Component | null;
  reading?: Reading;
  onChange: (patch: Partial<Component>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: () => void;
  onFlip: () => void;
  digits: number;
}) {
  const [advanced, setAdvanced] = useState(false);

  if (!selected) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-fg-soft">Réglages</p>
          <p className="mt-0.5 text-[10px] text-fg-mute">Sélectionnez un dipôle sur la grille</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line/60 bg-ink-850 text-fg-mute">
            <Zap size={18} />
          </span>
          <p className="text-xs leading-relaxed text-fg-mute">
            Cliquez sur un composant pour régler sa valeur, son orientation, ses bornes de commande ou l’éteindre.
          </p>
        </div>
        <div className="border-t border-line/60 p-3">
          <p className="label-xs mb-1.5">Montage</p>
          <dl className="grid grid-cols-2 gap-1.5 text-[11px]">
            <Metric label="Dipôles" value={String(doc.components.length)} />
            <Metric label="Masse" value={doc.ground ? `(${doc.ground})` : 'non définie'} />
            <Metric label="Borne A" value={doc.terminals.a ? `(${doc.terminals.a})` : '—'} />
            <Metric label="Borne B" value={doc.terminals.b ? `(${doc.terminals.b})` : '—'} />
          </dl>
        </div>
      </div>
    );
  }

  const meta = COMPONENT_META[selected.kind];
  const presets = PRESETS[selected.kind] ?? [];
  const isSource = selected.kind === 'vsource' || selected.kind === 'isource';
  const isReactive = selected.kind === 'capacitor' || selected.kind === 'inductor';
  const isLinked = selected.kind === 'vcvs' || selected.kind === 'vccs';
  const unit = UNIT_SUFFIX[selected.kind] ?? '';
  const orientation = orientationOf(selected);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line/60 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{selected.label ?? selected.id}</p>
          <p className="text-[10px] uppercase tracking-wider text-fg-mute">{meta.label}</p>
        </div>
        <div className="flex gap-1">
          <IconButton title="Tourner 90°" onClick={onRotate}>
            <RotateCw size={13} />
          </IconButton>
          <IconButton title="Inverser les bornes" onClick={onFlip}>
            <ArrowDownUp size={13} />
          </IconButton>
          <IconButton title="Dupliquer" onClick={onDuplicate}>
            <Copy size={13} />
          </IconButton>
          <IconButton title="Supprimer" onClick={onDelete} danger>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <label className="label-xs mb-1 block">Référence</label>
          <input
            className="field"
            value={selected.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={selected.id}
          />
        </div>

        <div>
          <label className="label-xs mb-1 flex items-center justify-between">
            <span>Valeur {unit ? `(${unit})` : ''}</span>
            <span className="font-mono text-[10px] normal-case tracking-normal text-spark-cyan">
              {formatSI(selected.value, meta.unit, { digits })}
            </span>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="any"
              className="field"
              value={rawNumber(selected.value, 10)}
              onChange={(e) => onChange({ value: Number(e.target.value) })}
            />
            {isReactive ? (
              <select
                className="field w-24"
                value={scaleOf(selected.value)}
                onChange={(e) => {
                  const factor = Number(e.target.value);
                  onChange({ value: Number((selected.value * factor).toPrecision(4)) });
                }}
              >
                <option value={1}>× 1</option>
                <option value={1e-3}>m</option>
                <option value={1e-6}>µ</option>
                <option value={1e-9}>n</option>
                <option value={1e-12}>p</option>
              </select>
            ) : null}
          </div>
          {presets.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChange({ value: preset })}
                  className={cn(
                    'rounded-md border px-1.5 py-0.5 font-mono text-[10px] transition',
                    selected.value === preset
                      ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                      : 'border-line/50 bg-ink-850/70 text-fg-mute hover:text-fg',
                  )}
                >
                  {formatSI(preset, meta.unit, { digits: 2, space: false })}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isSource ? (
          <div className="space-y-2 rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="label-xs">Régime alternatif</span>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    selected.ac
                      ? { ac: undefined }
                      : { ac: { amplitude: selected.value || 10, frequency: doc.frequency || 50, phaseDeg: 0 } },
                  )
                }
                className={cn(
                  'relative h-5 w-9 rounded-full transition',
                  selected.ac ? 'bg-spark-cyan/80' : 'bg-ink-700',
                )}
                aria-pressed={Boolean(selected.ac)}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-4 w-4 rounded-full bg-ink-950 transition',
                    selected.ac ? 'left-4.5' : 'left-0.5',
                  )}
                  style={{ left: selected.ac ? 18 : 2 }}
                />
              </button>
            </div>
            {selected.ac ? (
              <div className="grid grid-cols-3 gap-1.5">
                <Field
                  label="Amplitude"
                  value={selected.ac.amplitude}
                  onChange={(v) =>
                    onChange({ ac: { ...selected.ac!, amplitude: v } })
                  }
                />
                <Field
                  label="Fréq. (Hz)"
                  value={selected.ac.frequency}
                  onChange={(v) => onChange({ ac: { ...selected.ac!, frequency: v } })}
                />
                <Field
                  label="Phase (°)"
                  value={selected.ac.phaseDeg}
                  onChange={(v) => onChange({ ac: { ...selected.ac!, phaseDeg: v } })}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {selected.kind === 'switch' ? (
          <button
            type="button"
            onClick={() => onChange({ closed: selected.closed === false })}
            className="flex w-full items-center justify-between rounded-xl border border-line/50 bg-ink-850/60 p-2.5 text-sm"
          >
            <span className="flex items-center gap-2 text-fg-soft">
              <CircleSlash size={14} />
              Interrupteur
            </span>
            <span
              className={cn(
                'rounded-md px-2 py-0.5 font-mono text-[10px] uppercase',
                selected.closed === false
                  ? 'bg-spark-coral/15 text-spark-coral'
                  : 'bg-spark-green/15 text-spark-green',
              )}
            >
              {selected.closed === false ? 'ouvert' : 'fermé'}
            </span>
          </button>
        ) : null}

        {isLinked ? (
          <div className="space-y-2 rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
            <p className="label-xs flex items-center gap-1">
              <Link2 size={11} /> Commande
            </p>
            <Field
              label={`Gain ${selected.kind === 'vcvs' ? '(V/V)' : '(A/V)'}`}
              value={selected.gain ?? 1}
              step={0.001}
              onChange={(v) => onChange({ gain: v })}
            />
            <p className="text-[10px] leading-relaxed text-fg-mute">
              La tension de commande est lue entre deux nœuds du montage : renseignez leurs coordonnées (x,y).
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                className="field text-[11px]"
                value={selected.ctrl?.a ?? ''}
                placeholder="nœud + (x,y)"
                onChange={(e) => {
                  const p = parseCell(e.target.value);
                  if (!p) return;
                  onChange({ ctrl: { a: pointToCell(p.x, p.y), b: selected.ctrl?.b ?? selected.b } });
                }}
              />
              <input
                className="field text-[11px]"
                value={selected.ctrl?.b ?? ''}
                placeholder="nœud − (x,y)"
                onChange={(e) => {
                  const p = parseCell(e.target.value);
                  if (!p) return;
                  onChange({ ctrl: { a: selected.ctrl?.a ?? selected.a, b: pointToCell(p.x, p.y) } });
                }}
              />
            </div>
          </div>
        ) : null}

        {reading ? (
          <div className="rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
            <p className="label-xs mb-1.5 flex items-center gap-1">
              <Gauge size={11} /> Mesures
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Tension" value={formatSI(Math.hypot(reading.v.re, reading.v.im), 'V')} accent />
              <Metric
                label="Courant"
                value={
                  Number.isFinite(reading.i.re)
                    ? formatSI(Math.hypot(reading.i.re, reading.i.im), 'A')
                    : '—'
                }
                accent
              />
              <Metric
                label="Puissance"
                value={Number.isFinite(reading.p.re) ? formatSI(Math.abs(reading.p.re), 'W') : '—'}
              />
              <Metric
                label="Impédance"
                value={
                  Number.isFinite(reading.v.re) && Number.isFinite(reading.i.re) && reading.i.re !== 0
                    ? formatSI(Math.abs(reading.v.re / reading.i.re), 'Ω')
                    : '—'
                }
              />
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-line/40 bg-ink-900/60 px-2.5 py-2 text-[11px] text-fg-soft"
        >
          <span className="flex items-center gap-1.5">
            <Info size={12} /> Détails du composant
          </span>
          <span className={cn('transition', advanced && 'rotate-90')}>›</span>
        </button>
        {advanced ? (
          <div className="space-y-1.5 rounded-lg border border-line/40 bg-ink-900/60 p-2.5 text-[11px] text-fg-mute">
            <p className="leading-relaxed">{meta.hint}</p>
            <dl className="grid grid-cols-2 gap-1 font-mono text-[10px]">
              <dt>identifiant</dt>
              <dd className="text-right text-fg-soft">{selected.id}</dd>
              <dt>nœud A</dt>
              <dd className="text-right text-fg-soft">({selected.a})</dd>
              <dt>nœud B</dt>
              <dd className="text-right text-fg-soft">({selected.b})</dd>
              <dt>orientation</dt>
              <dd className="text-right text-fg-soft">{orientation === 'h' ? 'horizontale' : orientation === 'v' ? 'verticale' : 'diagonale'}</dd>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line/40 bg-ink-900/70 px-2 py-1.5">
      <dt className="text-[9px] uppercase tracking-wider text-fg-mute">{label}</dt>
      <dd className={cn('font-mono text-[11px]', accent ? 'text-spark-cyan' : 'text-fg-soft')}>{value}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-fg-mute">{label}</span>
      <input
        type="number"
        step={step ?? 'any'}
        className="field px-2 py-1 text-[11px]"
        value={rawNumber(value, 8)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function IconButton({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md border border-line/60 bg-ink-850 text-fg-soft transition hover:bg-ink-800 hover:text-fg',
        danger && 'hover:border-spark-coral/50 hover:text-spark-coral',
      )}
    >
      {children}
    </button>
  );
}

function scaleOf(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 1;
  if (abs < 1e-9) return 1e-12;
  if (abs < 1e-6) return 1e-9;
  if (abs < 1e-3) return 1e-6;
  if (abs < 1) return 1e-3;
  return 1;
}

function parseCell(raw: string): { x: number; y: number } | null {
  const match = raw.match(/^\s*(-?\d+)\s*[,;]\s*(-?\d+)\s*$/);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

