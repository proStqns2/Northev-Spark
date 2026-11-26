'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  Cpu,
  FlaskConical,
  Info,
  Sigma,
  Sparkles,
  Zap,
} from 'lucide-react';
import { CircuitDoc } from '@/lib/engine/types';
import { EquivalentResult } from '@/lib/engine/equivalent';
import { AnalysisResult, AnalysisFailure } from '@/lib/engine/solver';
import { formatSI, formatPhasor } from '@/lib/engine/format';
import { abs } from '@/lib/engine/complex';
import { reduceSeriesParallel } from '@/lib/engine/reduce';
import { cn } from '@/lib/utils';

type Tab = 'equivalent' | 'reduction' | 'details';

export function ResultsPanel({
  doc,
  equivalent,
  solution,
  digits,
  compact,
}: {
  doc: CircuitDoc;
  equivalent: EquivalentResult;
  solution: AnalysisResult | AnalysisFailure;
  digits: number;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('equivalent');
  const [showSteps, setShowSteps] = useState(true);
  const reduction = reduceSeriesParallel(doc);

  const vth = equivalent.ok ? formatPhasor(equivalent.vth) : '—';
  const rth = equivalent.ok
    ? `${formatSI(abs(equivalent.rth), 'Ω', { digits })}`
    : '—';
  const rthAngle = equivalent.ok ? (Math.atan2(equivalent.rth.im, equivalent.rth.re) * 180) / Math.PI : 0;
  const inorton = equivalent.ok
    ? Number.isFinite(abs(equivalent.inorton))
      ? formatSI(abs(equivalent.inorton), 'A', { digits })
      : '∞'
    : '—';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line/60 px-2 pt-2">
        {(
          [
            { id: 'equivalent', label: 'Équivalent', icon: Zap },
            { id: 'reduction', label: 'Réduction', icon: Sigma },
            { id: 'details', label: 'Détails', icon: Cpu },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-t-lg border-b-2 px-2.5 py-2 text-[11.5px] font-medium transition',
                tab === item.id
                  ? 'border-spark-cyan text-fg'
                  : 'border-transparent text-fg-mute hover:text-fg-soft',
              )}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-1 pr-1 font-mono text-[10px] text-fg-mute">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              equivalent.ok ? 'bg-spark-green shadow-[0_0_6px] shadow-spark-green' : 'bg-spark-coral',
            )}
          />
          {equivalent.ok ? 'solveur actif' : 'incomplet'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {tab === 'equivalent' ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              <ValueCard label="U_th" value={vth} sub="tension à vide" tone={equivalent.ok ? 'cyan' : 'muted'} />
              <ValueCard
                label="Z_th"
                value={rth}
                sub={equivalent.ok && Math.abs(rthAngle) > 0.05 ? `∠ ${rthAngle.toFixed(1)}°` : 'impédance interne'}
                tone={equivalent.ok ? 'violet' : 'muted'}
              />
              <ValueCard label="I_N" value={inorton} sub="courant Norton" tone={equivalent.ok ? 'amber' : 'muted'} />
            </div>

            {equivalent.ok ? (
              <>
                <div className="rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
                      Équivalence T ⇄ N
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSteps((v) => !v)}
                      className="text-fg-mute transition hover:text-fg"
                      aria-label="Afficher la démarche"
                    >
                      <ChevronDown size={13} className={cn('transition', !showSteps && '-rotate-90')} />
                    </button>
                  </div>
                  <p className="font-mono text-[10.5px] leading-relaxed text-fg-soft">
                    E_th = {formatPhasor(equivalent.vth)} · I_N = {formatSI(abs(equivalent.inorton), 'A')} · R_N ={' '}
                    {formatSI(abs(equivalent.rth), 'Ω')}
                  </p>
                  <p className="mt-1 text-[10px] text-fg-mute">
                    Écart de vérification croisée :{' '}
                    <span
                      className={cn(
                        'font-mono',
                        equivalent.verificationErrorPct < 1 ? 'text-spark-green' : 'text-spark-amber',
                      )}
                    >
                      {equivalent.verificationErrorPct.toExponential(2)} %
                    </span>
                  </p>
                  {showSteps ? (
                    <ol className="mt-2 space-y-1.5 border-t border-line/40 pt-2">
                      {equivalent.steps.map((step, index) => (
                        <li key={step.title} className="flex gap-2">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-spark-cyan/40 bg-spark-cyan/10 font-mono text-[8px] text-spark-cyan">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[10.5px] font-medium text-fg-soft">{step.title}</p>
                            <p className="text-[9.5px] leading-snug text-fg-mute">{step.detail}</p>
                            {step.value ? (
                              <p className="mt-0.5 font-mono text-[9.5px] text-spark-cyan/90">{step.value}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </div>

                {equivalent.superposition.length ? (
                  <div className="rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
                      <ArrowLeftRight size={10} /> Superposition
                    </p>
                    <ul className="space-y-1">
                      {equivalent.superposition.map((term) => (
                        <li key={term.id} className="flex items-baseline justify-between gap-2 font-mono text-[10px]">
                          <span className="truncate text-fg-soft">{term.label}</span>
                          <span className="shrink-0 text-spark-cyan">
                            {formatPhasor(term.contribution)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {equivalent.warnings.length ? (
                  <div className="rounded-xl border border-spark-amber/30 bg-spark-amber/[0.06] p-2.5">
                    <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-spark-amber">
                      <AlertTriangle size={10} /> Points d’attention
                    </p>
                    <ul className="space-y-1 text-[10px] leading-relaxed text-fg-soft">
                      {equivalent.warnings.map((w) => (
                        <li key={w}>• {w}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-xl border border-spark-green/30 bg-spark-green/[0.06] p-2 text-[10px] text-spark-green">
                    <CheckCircle2 size={12} /> Aucun avertissement : le montage est numériquement stable.
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-spark-coral/30 bg-spark-coral/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-spark-coral">
                  <Info size={12} /> {equivalent.status === 'incomplete' ? 'Montage incomplet' : 'Calcul impossible'}
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-fg-soft">{equivalent.error}</p>
                <p className="mt-2 text-[10px] text-fg-mute">
                  Définissez la masse et les bornes A / B, puis ajoutez au moins une source et une charge.
                </p>
              </div>
            )}

            {equivalent.ok && equivalent.powerMax !== undefined ? (
              <div className="rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">Adaptation</p>
                <p className="mt-1 font-mono text-[10.5px] text-fg-soft">
                  P_max = U_th² / (4·R_th) ={' '}
                  <span className="text-spark-green">{formatSI(equivalent.powerMax, 'W')}</span> pour R_L ={' '}
                  {formatSI(abs(equivalent.rth), 'Ω')}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'reduction' ? (
          <div className="space-y-2">
            <div className="rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
                Réduction série / parallèle
              </p>
              <p className="mt-1 font-mono text-[10.5px] text-spark-cyan">{reduction.finalFormula}</p>
              <p className="mt-0.5 text-[10px] text-fg-mute">{reduction.note}</p>
            </div>
            <ol className="space-y-1.5">
              {reduction.steps.map((step) => (
                <li
                  key={`${step.index}-${step.rule}`}
                  className="rounded-lg border border-line/40 bg-ink-900/60 p-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded border border-line/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-fg-soft">
                      {step.rule}
                    </span>
                    <span className="font-mono text-[10px] text-spark-cyan">{step.result}</span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-fg-soft">{step.formula}</p>
                  <p className="mt-0.5 text-[9.5px] leading-snug text-fg-mute">{step.explanation}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {tab === 'details' ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <ValueCard
                label="Nœuds"
                value={solution.ok ? String(solution.size.nodes) : '—'}
                sub="inconnues nodales"
                tone="muted"
                small
              />
              <ValueCard
                label="Branches"
                value={solution.ok ? String(solution.size.branches) : '—'}
                sub="sources de tension"
                tone="muted"
                small
              />
            </div>
            {!compact && solution.ok ? (
              <div className="overflow-hidden rounded-xl border border-line/50">
                <table className="w-full text-left text-[10px]">
                  <thead className="bg-ink-850/80 text-fg-mute">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Réf.</th>
                      <th className="px-2 py-1.5 text-right font-medium">U</th>
                      <th className="px-2 py-1.5 text-right font-medium">I</th>
                      <th className="px-2 py-1.5 text-right font-medium">P</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/30">
                    {doc.components.map((c) => {
                      const r = solution.readings[c.id];
                      return (
                        <tr key={c.id} className="bg-ink-900/40">
                          <td className="truncate px-2 py-1 font-mono text-fg-soft">{c.label ?? c.id}</td>
                          <td className="px-2 py-1 text-right font-mono text-fg">
                            {r && Number.isFinite(r.v.re)
                              ? formatSI(r.v.im !== 0 ? abs(r.v) : r.v.re, 'V', { digits: 3 })
                              : '—'}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-fg">
                            {r && Number.isFinite(r.i.re)
                              ? formatSI(r.i.im !== 0 ? abs(r.i) : r.i.re, 'A', { digits: 3 })
                              : '—'}
                          </td>
                          <td className="px-2 py-1 text-right font-mono text-fg-soft">
                            {r && Number.isFinite(r.p.re) ? formatSI(Math.abs(r.p.re), 'W', { digits: 3 }) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-spark-coral/30 bg-spark-coral/[0.06] p-2.5 text-[10.5px] text-fg-soft">
                {solution.ok ? 'Tableau complet disponible en vue large.' : solution.error}
              </div>
            )}

            <div className="rounded-xl border border-line/50 bg-ink-850/50 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
                <FlaskConical size={10} /> Rappel de méthode
              </p>
              <ol className="space-y-1 text-[10px] leading-relaxed text-fg-mute">
                <li>1. On remplace le réseau par E_th en série avec R_th (Thévenin).</li>
                <li>2. Ou par I_N en parallèle avec R_N (Norton).</li>
                <li>3. R_th = R_N et E_th = R_N · I_N : les deux modèles sont interchangeables.</li>
              </ol>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-line/60 px-2.5 py-1.5">
        <p className="flex items-center gap-1 text-[9.5px] text-fg-mute">
          <Sparkles size={9} className="text-spark-violet" />
          {doc.regime === 'ac'
            ? `Régime sinusoïdal · ${formatSI(doc.frequency, 'Hz')} · phaseurs en amplitude`
            : 'Régime continu · analyse nodale modifiée'}
        </p>
      </div>
    </div>
  );
}

function ValueCard({
  label,
  value,
  sub,
  tone,
  small,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'cyan' | 'violet' | 'amber' | 'muted';
  small?: boolean;
}) {
  const tones = {
    cyan: 'border-spark-cyan/40 bg-spark-cyan/[0.06] text-spark-cyan',
    violet: 'border-spark-violet/40 bg-spark-violet/[0.06] text-spark-violet',
    amber: 'border-spark-amber/40 bg-spark-amber/[0.06] text-spark-amber',
    muted: 'border-line/60 bg-ink-850/60 text-fg-soft',
  };
  return (
    <div className={cn('rounded-xl border', tones[tone], small ? 'p-1.5' : 'p-2')}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className={cn('mt-0.5 truncate font-mono font-semibold', small ? 'text-[12px]' : 'text-[13px]')}>{value}</p>
      {sub ? <p className="truncate text-[8.5px] text-fg-mute">{sub}</p> : null}
    </div>
  );
}
