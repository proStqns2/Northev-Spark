'use client';

import { Check, Circle, MousePointer2, PlugZap, Sparkles, X } from 'lucide-react';
import { CircuitDoc } from '@/lib/engine/types';
import { EquivalentResult } from '@/lib/engine/equivalent';
import { cn } from '@/lib/utils';

/**
 * Guide de démarrage du studio.
 *
 * Le solveur a besoin de trois choses pour produire un équivalent :
 *   1. au moins deux dipôles reliés,
 *   2. une masse (référence de potentiel),
 *   3. les bornes A et B du dipôle à modéliser.
 *
 * Sans ce bandeau, l'utilisateur voit « calcul incomplet » sans comprendre
 * quoi faire. Il indique l'étape suivante et disparaît dès que le calcul passe.
 */

export function SetupGuide({
  doc,
  equivalent,
  onGround,
  onTerminal,
  onDismiss,
}: {
  doc: CircuitDoc;
  equivalent: EquivalentResult;
  onGround: () => void;
  onTerminal: (which: 'a' | 'b') => void;
  onDismiss: () => void;
}) {
  const hasComponents = doc.components.length >= 1;
  const hasGround = Boolean(doc.ground);
  const hasA = Boolean(doc.terminals.a);
  const hasB = Boolean(doc.terminals.b);

  const steps = [
    {
      done: hasComponents,
      label: 'Poser des dipôles',
      hint: 'Choisissez un composant, cliquez deux nœuds de la grille',
      action: null as (() => void) | null,
      actionLabel: '',
    },
    {
      done: hasGround,
      label: 'Placer la masse',
      hint: 'Référence de potentiel (0 V) — outil Masse',
      action: onGround,
      actionLabel: 'Masse',
    },
    {
      done: hasA && hasB,
      label: 'Choisir les bornes A et B',
      hint: 'Le dipôle équivalent est vu entre A et B',
      action: () => onTerminal(hasA ? 'b' : 'a'),
      actionLabel: hasA ? 'Borne B' : 'Borne A',
    },
  ];

  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;

  const next = steps.find((s) => !s.done);

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex justify-center">
      <div className="pointer-events-auto flex max-w-[560px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-spark-cyan/35 bg-ink-950/94 px-3 py-2 shadow-panel backdrop-blur-md">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-spark-cyan">
          <Sparkles size={12} />
          {equivalent.status === 'shorted' ? 'Bornes en court-circuit' : 'Pour obtenir l’équivalent'}
        </span>

        <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-1 text-[10.5px]" title={step.hint}>
              {step.done ? (
                <Check size={10} className="text-spark-green" />
              ) : (
                <Circle size={10} className="text-fg-mute" />
              )}
              <span className={step.done ? 'text-fg-mute line-through' : 'text-fg-soft'}>{step.label}</span>
            </li>
          ))}
        </ol>

        {next?.action ? (
          <button
            type="button"
            onClick={next.action}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition',
              'border-spark-cyan/50 bg-spark-cyan/10 text-spark-cyan hover:bg-spark-cyan/15',
            )}
          >
            {next.actionLabel === 'Masse' ? <PlugZap size={11} /> : <MousePointer2 size={11} />}
            {next.actionLabel}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-0.5 text-fg-mute transition hover:text-fg"
          aria-label="Masquer le guide"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
