'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { CircuitDoc, Component } from '@/lib/engine/types';
import { EquivalentResult } from '@/lib/engine/equivalent';
import { cn } from '@/lib/utils';

/**
 * Diagnostic du montage.
 *
 * Le solveur sait calculer, mais un montage « valide » peut être
 * physiquement trompeur : dipôle isolé de la masse, bornes qui tombent sur le
 * même nœud, source sans retour, valeurs nulles… Autant de cas où l'élève
 * obtient un Z_th de 5·10¹¹ Ω sans comprendre pourquoi. Ce bloc nomme le
 * problème et propose la correction.
 */

type Issue = {
  level: 'error' | 'warn' | 'info';
  title: string;
  fix: string;
};

export function CircuitDiagnostics({
  doc,
  equivalent,
}: {
  doc: CircuitDoc;
  equivalent: EquivalentResult;
}) {
  const issues = useMemo(() => {
    const list: Issue[] = [];
    const { components, ground, terminals } = doc;

    if (!components.length) {
      return [
        {
          level: 'info' as const,
          title: 'Grille vide',
          fix: 'Choisissez un dipôle dans « Valeurs », puis cliquez deux nœuds.',
        },
      ];
    }

    if (!ground) {
      list.push({
        level: 'error',
        title: 'Aucune masse',
        fix: 'L’outil Masse fixe le 0 V. Sans lui, les potentiels sont indéfinis.',
      });
    }

    if (!terminals.a || !terminals.b) {
      list.push({
        level: 'error',
        title: 'Bornes A et B incomplètes',
        fix: 'Choisissez A puis B : c’est le dipôle vu entre ces deux nœuds.',
      });
    } else if (terminals.a === terminals.b) {
      list.push({
        level: 'error',
        title: 'A et B sur le même nœud',
        fix: 'Le dipôle serait court-circuité par définition. Déplacez une borne.',
      });
    }

    /* dipôles dont les deux extrémités sont sur le même nœud */
    const zeroSpan = components.filter((c: Component) => c.a === c.b);
    if (zeroSpan.length) {
      list.push({
        level: 'warn',
        title: `${zeroSpan.length} dipôle(s) posé(s) sur un seul nœud`,
        fix: 'Un dipôle doit relier deux nœuds distincts. Supprimez-les ou étirez-les.',
      });
    }

    /* valeurs absurdes */
    const nulls = components.filter(
      (c) => c.kind !== 'switch' && c.kind !== 'lamp' && !(Number.isFinite(c.value) && c.value > 0),
    );
    if (nulls.length) {
      list.push({
        level: 'warn',
        title: `${nulls.length} dipôle(s) à valeur nulle ou invalide`,
        fix: 'Renseignez R, L, C, E ou I₀ dans le panneau « Valeurs ».',
      });
    }

    /* composants totalement isolés du reste du graphe */
    if (components.length > 1) {
      const parent = new Map<string, string>();
      const find = (x: string): string => {
        const p = parent.get(x);
        if (!p || p === x) return x;
        const root = find(p);
        parent.set(x, root);
        return root;
      };
      const union = (x: string, y: string) => {
        parent.set(find(x), find(y));
      };
      components.forEach((c) => {
        if (!parent.has(c.a)) parent.set(c.a, c.a);
        if (!parent.has(c.b)) parent.set(c.b, c.b);
        union(c.a, c.b);
      });
      const groups = new Map<string, number>();
      components.forEach((c) => {
        const root = find(c.a);
        groups.set(root, (groups.get(root) ?? 0) + 1);
      });
      const islands = groups.size - (ground ? (groups.has(find(ground)) ? 1 : 0) : 0);
      if (islands > 0) {
        list.push({
          level: 'warn',
          title: `${islands} groupe(s) de dipôles isolé(s)`,
          fix: 'Reliez chaque partie au circuit principal, sinon elle n’influence pas le résultat.',
        });
      }
    }

    /* statut du solveur */
    if (equivalent.ok && equivalent.status === 'open') {
      list.push({
        level: 'info',
        title: 'Z_th infinie (circuit ouvert)',
        fix: 'Normal vu des bornes : aucun chemin conducteur ne relie A à B.',
      });
    }

    for (const w of equivalent.warnings ?? []) {
      list.push({ level: 'info', title: 'Solveur', fix: w });
    }

    return list;
  }, [doc, equivalent]);

  const hasError = issues.some((i) => i.level === 'error');
  const allGood = !hasError && issues.length === 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-2.5',
        hasError ? 'border-spark-coral/40 bg-spark-coral/[0.06]' : 'border-line/50 bg-ink-850/50',
      )}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
        {allGood ? (
          <>
            <CheckCircle2 size={11} className="text-spark-green" /> Montage cohérent
          </>
        ) : (
          <>
            <AlertTriangle size={11} className="text-spark-amber" /> Diagnostic
          </>
        )}
        <span className="ml-auto rounded border border-line/50 px-1.5 py-0.5 font-mono text-[9px] normal-case tracking-normal text-fg-mute">
          {issues.length} point{issues.length > 1 ? 's' : ''}
        </span>
      </p>

      {allGood ? (
        <p className="text-[10.5px] leading-relaxed text-fg-mute">
          Masse, bornes et valeurs sont en place. Le résultat est exploitable.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {issues.slice(0, 6).map((issue, index) => (
            <li key={`${issue.title}-${index}`} className="flex gap-1.5">
              <span
                className={cn(
                  'mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full',
                  issue.level === 'error'
                    ? 'bg-spark-coral'
                    : issue.level === 'warn'
                      ? 'bg-spark-amber'
                      : 'bg-spark-cyan/70',
                )}
              />
              <span className="min-w-0">
                <span className="block text-[10.5px] font-medium leading-snug text-fg-soft">{issue.title}</span>
                <span className="flex items-start gap-1 text-[10px] leading-snug text-fg-mute">
                  <Lightbulb size={9} className="mt-[2px] shrink-0 text-spark-amber/70" />
                  {issue.fix}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
