'use client';

import { useMemo, useState } from 'react';
import { Cog, Check, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Aide au dimensionnement d’un filtre RC à partir de séries normalisées.
 *
 * Saisir la fréquence de coupure visée suffit : on propose les couples
 * (R, C) réels de la série E24, classés par erreur, avec le τ et
 * l’impédance au point de coupure.
 */

const E24 = [
  10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91,
];

interface Candidate {
  resistance: number;
  capacite: number;
  fc: number;
  error: number;
  tauUs: number;
  zc: number;
}

function serie(base: number, decade: number): number[] {
  return E24.map((value) => value * 10 ** decade).map((value) => (base ? value : value));
}

export function FilterDesigner() {
  const [target, setTarget] = useState(1000);
  const [kind, setKind] = useState<'lowpass' | 'highpass'>('lowpass');
  const [impedanceGoal, setImpedanceGoal] = useState(1000);

  const candidates = useMemo<Candidate[]>(() => {
    const list: Candidate[] = [];
    for (const decade of [-1, 0, 1, 2, 3]) {
      for (const capacitance of serie(100, decade - 9)) {
        // capacités de 100 pF à 1 µF environ
        const capacite = capacitance;
        const resistance = 1 / (2 * Math.PI * target * capacite * 1e-12);
        const rounded = roundE24(resistance);
        const fcReal = 1 / (2 * Math.PI * rounded * capacite * 1e-12);
        list.push({
          resistance: rounded,
          capacite,
          fc: fcReal,
          error: ((fcReal - target) / target) * 100,
          tauUs: (rounded * capacite * 1e-12) * 1e6,
          zc: rounded,
        });
      }
    }
    return list
      .filter((item) => item.resistance >= 10 && item.resistance <= 1e6 && item.capacite >= 100 && item.capacite <= 1e6)
      .sort((a, b) => Math.abs(a.error) - Math.abs(b.error))
      .slice(0, 6);
  }, [target]);

  const best = candidates[0];
  const idealImp = impedanceGoal;

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setKind('lowpass')}
            className={cn('chip', kind === 'lowpass' && 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan')}
          >
            Passe-bas
          </button>
          <button
            type="button"
            onClick={() => setKind('highpass')}
            className={cn('chip', kind === 'highpass' && 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan')}
          >
            Passe-haut
          </button>
        </div>
        <span className="chip">
          <Cog size={11} /> Série E24
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="flex items-center justify-between text-[10.5px] text-fg-mute">
            Fréquence de coupure visée
            <span className="font-mono text-fg-soft">{target.toLocaleString('fr-FR')} Hz</span>
          </span>
          <input
            type="range"
            min={50}
            max={50000}
            step={50}
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
            className="mt-1 h-1.5 w-full appearance-none rounded-full bg-ink-700 accent-spark-cyan"
          />
        </label>
        <label className="block">
          <span className="flex items-center justify-between text-[10.5px] text-fg-mute">
            Impédance souhaitée au point de coupure
            <span className="font-mono text-fg-soft">{impedanceGoal.toLocaleString('fr-FR')} Ω</span>
          </span>
          <input
            type="range"
            min={100}
            max={10000}
            step={100}
            value={impedanceGoal}
            onChange={(event) => setImpedanceGoal(Number(event.target.value))}
            className="mt-1 h-1.5 w-full appearance-none rounded-full bg-ink-700 accent-spark-cyan"
          />
        </label>
      </div>

      {best ? (
        <div className="mt-3 rounded-xl border border-spark-cyan/30 bg-spark-cyan/[0.05] p-3">
          <p className="text-[10px] uppercase tracking-wide text-fg-mute">Couple retenu</p>
          <p className="mt-1 font-mono text-[15px] font-semibold text-spark-cyan">
            R = {formatOhm(best.resistance)} · C = {formatFarad(best.capacite)}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="f réelle" value={`${best.fc.toFixed(0)} Hz`} />
            <Metric label="Erreur" value={`${best.error >= 0 ? '+' : ''}${best.error.toFixed(1)} %`} warn={Math.abs(best.error) > 10} />
            <Metric label="τ" value={`${best.tauUs.toFixed(1)} µs`} />
            <Metric label="Z au f_c" value={`${formatOhm(best.resistance)}`} />
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-fg-soft">
            <Check size={11} className="mt-0.5 shrink-0 text-spark-green" />
            {kind === 'lowpass'
              ? 'Montage : R en série, C en parallèle, sortie aux bornes de C.'
              : 'Montage : C en série, R en parallèle, sortie aux bornes de R.'}{' '}
            L’impédance visée ({formatOhm(idealImp)}) est à comparer au module de C à la coupure : {formatOhm(best.zc)}.
          </p>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[9.5px] uppercase tracking-wide text-fg-mute">
              <th className="py-1 pr-2 font-medium">R</th>
              <th className="py-1 pr-2 font-medium">C</th>
              <th className="py-1 pr-2 font-medium">f_c</th>
              <th className="py-1 pr-2 font-medium">Erreur</th>
              <th className="py-1 pr-2 font-medium">τ</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const ok = Math.abs(candidate.error) <= 5;
              return (
                <tr key={`${candidate.resistance}-${candidate.capacite}`} className="border-t border-line/30">
                  <td className="py-1 pr-2 font-mono">{formatOhm(candidate.resistance)}</td>
                  <td className="py-1 pr-2 font-mono">{formatFarad(candidate.capacite)}</td>
                  <td className="py-1 pr-2 font-mono">{candidate.fc.toFixed(0)} Hz</td>
                  <td className={cn('py-1 pr-2 font-mono', ok ? 'text-spark-green' : 'text-spark-amber')}>
                    {candidate.error >= 0 ? '+' : ''}
                    {candidate.error.toFixed(1)} %
                  </td>
                  <td className="py-1 pr-2 font-mono text-fg-mute">{candidate.tauUs.toFixed(1)} µs</td>
                </tr>
              );
            })}
            {candidates.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-2 text-fg-mute">
                  <TriangleAlert size={11} className="mr-1 inline" /> Aucun couple dans la plage 10 Ω – 1 MΩ avec C
                  entre 100 pF et 1 µF. Changez la fréquence cible.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-fg-mute">{label}</p>
      <p className={cn('font-mono text-[11.5px] font-semibold', warn ? 'text-spark-amber' : 'text-fg')}>{value}</p>
    </div>
  );
}

function roundE24(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const decade = 10 ** Math.floor(Math.log10(value));
  const normalized = value / decade;
  let closest = E24[0];
  for (const candidate of E24) {
    if (Math.abs(candidate - normalized) < Math.abs(closest - normalized)) closest = candidate;
  }
  return Math.round(closest * decade * 100) / 100;
}

function formatOhm(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MΩ`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)} kΩ`;
  return `${value.toFixed(0)} Ω`;
}

function formatFarad(picofarads: number): string {
  if (picofarads >= 1e6) return `${(picofarads / 1e6).toFixed(2)} µF`;
  if (picofarads >= 1e3) return `${(picofarads / 1e3).toFixed(2)} nF`;
  return `${picofarads.toFixed(0)} pF`;
}
