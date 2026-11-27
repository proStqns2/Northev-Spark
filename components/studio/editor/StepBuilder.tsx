'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CircleDot,
  CircuitBoard,
  ListPlus,
  RotateCcw,
  Trash2,
  Unplug,
  Zap,
} from 'lucide-react';
import { COMPONENT_META } from '@/lib/engine/types';
import type { ComponentKind } from '@/lib/engine/types';
import {
  addWire,
  cellKey,
  commit,
  nodesOf,
  parseCell,
  placePart,
  placePartFrom,
  removePart,
  replaceDoc,
  type EditorState,
} from '@/lib/studio/editor';
import { parseEngineerValue } from '@/lib/express/params';
import { cn } from '@/lib/utils';

/**
 * Montage pas à pas — la voie sans plan.
 *
 * Le plan (canvas SVG) reste le chemin principal, mais il suppose un pointeur
 * précis et une surface mesurée par le navigateur. Ce panneau construit le même
 * document (`CircuitDoc`) uniquement avec des boutons et des champs :
 *
 *  1. on choisit un dipôle ; « Poser en série » le place au curseur et
 *     connecte sa borne B au dipôle suivant ;
 *  2. « Nouveau nœud » ouvre une branche libre, « Relier » ferme la boucle avec
 *     un fil, « Masse » pose la référence ;
 *  3. « Calculer » lance le même solveur que le plan.
 *
 * Rien ici ne dépend de la taille du canvas : si l'affichage du plan est cassé
 * sur un appareil, le montage reste faisable et calculable.
 */

const CHAIN: Array<{ kind: ComponentKind; label: string }> = [
  { kind: 'resistor', label: 'Résistance' },
  { kind: 'capacitor', label: 'Condensateur' },
  { kind: 'inductor', label: 'Bobine' },
  { kind: 'vsource', label: 'Source V' },
  { kind: 'isource', label: 'Source I' },
  { kind: 'lamp', label: 'Lampe' },
  { kind: 'switch', label: 'Interrupteur' },
];

const ORIGIN = { x: 2, y: 2 };

interface Props {
  state: EditorState;
  apply: (update: (state: EditorState) => EditorState) => void;
  onSolve: () => void;
}

export function StepBuilder({ state, apply, onSolve }: Props) {
  const [kind, setKind] = useState<ComponentKind>('resistor');
  const [value, setValue] = useState('1k');
  const [cursor, setCursor] = useState(ORIGIN);
  const [series, setSeries] = useState(true);

  const doc = state.doc;
  /** nœuds lisibles : N1, N2… plutôt que « 3,2 » */
  const nodeNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const [index, node] of nodesOf(doc).entries()) names.set(node, `N${index + 1}`);
    return names;
  }, [doc]);

  const last = doc.components[doc.components.length - 1];
  const lastCell = last ? parseCell(last.b) : null;
  const activeCell = lastCell ?? cursor;
  const activeNode = cellKey(activeCell.x, activeCell.y);
  const parsed = parseEngineerValue(value);

  /** pose le dipôle choisi, raccordé au dipôle précédent en mode série */
  const place = () => {
    const options = parsed === null ? {} : { value: parsed };
    const next =
      series && lastCell
        ? placePartFrom(state, kind, lastCell, options)
        : placePart(state, kind, cursor, options);
    if (!next.component) return;
    apply(() => next.state);
    const end = parseCell(next.component.b);
    if (end) setCursor(end);
  };

  const branch = () => {
    const column = Math.max(...doc.components.map((part) => (parseCell(part.b)?.x ?? 0)), 0);
    setCursor({ x: column + 3, y: ORIGIN.y });
    setSeries(false);
  };

  const closeLoop = () => {
    const nodes = nodesOf(doc);
    if (nodes.length < 2) return;
    const from = cellKey(activeCell.x, activeCell.y);
    const wired = addWire(doc, from, nodes[0]);
    if (!wired.added) return;
    apply((current) => commit(current, wired.doc, 'Relier les extrémités'));
  };

  const ground = () => {
    const node = cellKey(activeCell.x, activeCell.y);
    apply((current) => commit(current, { ...current.doc, ground: node }, 'Poser la masse'));
  };

  const clear = () => {
    apply((current) =>
      replaceDoc(current, { ...current.doc, components: [], ground: '', terminals: { a: null, b: null } }, 'Vider le plan'),
    );
    setCursor(ORIGIN);
    setSeries(true);
  };

  return (
    <section className="panel flex min-h-0 flex-col gap-2 p-2.5" aria-label="Montage pas à pas">
      <header className="flex items-center gap-1.5">
        <ListPlus size={13} className="text-spark-cyan" />
        <h2 className="text-[11.5px] font-medium text-fg">Montage pas à pas</h2>
        <span className="ml-auto font-mono text-[9.5px] text-fg-mute">
          {doc.components.length} dipôle{doc.components.length > 1 ? 's' : ''}
        </span>
      </header>

      <p className="text-[10px] leading-relaxed text-fg-mute">
        À utiliser si le plan ne s’affiche pas, ou pour aller vite au clavier : chaque bouton pose une pièce et la
        raccorde à la précédente.
      </p>

      {/* choix du dipôle */}
      <div className="flex flex-wrap gap-1">
        {CHAIN.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            onClick={() => setKind(entry.kind)}
            className={cn(
              'rounded-md border px-1.5 py-1 text-[10px] transition',
              kind === entry.kind
                ? 'border-spark-cyan/60 bg-spark-cyan/15 text-spark-cyan'
                : 'border-line/50 text-fg-soft hover:border-line hover:text-fg',
            )}
            aria-pressed={kind === entry.kind}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <label className="flex flex-1 items-center gap-1 rounded-md border border-line/50 px-1.5 py-1">
          <span className="font-mono text-[10px] text-fg-mute">valeur</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="4,7k · 100n · 12"
            className="w-full bg-transparent font-mono text-[11px] text-fg outline-none placeholder:text-fg-mute/60"
            aria-label="Valeur du dipôle à poser"
          />
        </label>
        <span className={cn('font-mono text-[9.5px]', parsed === null ? 'text-spark-amber' : 'text-fg-mute')}>
          {parsed === null ? '?' : `${formatValue(parsed)} ${unitOf(kind)}`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button type="button" onClick={place} className="btn btn-primary btn-sm justify-center">
          <CircuitBoard size={11} /> Poser {series ? 'en série' : 'ici'}
        </button>
        <button type="button" onClick={branch} className="btn btn-sm border-line/60 justify-center">
          <Unplug size={11} /> Nouveau nœud
        </button>
        <button type="button" onClick={closeLoop} className="btn btn-sm border-line/60 justify-center">
          <ArrowRight size={11} /> Relier la boucle
        </button>
        <button type="button" onClick={ground} className="btn btn-sm border-line/60 justify-center">
          <CircleDot size={11} /> Poser la masse
        </button>
      </div>

      <button type="button" onClick={onSolve} className="btn btn-sm justify-center border-spark-cyan/50 text-spark-cyan">
        <Zap size={11} /> Calculer ce montage
      </button>

      {/* liste des dipôles posés */}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-lg border border-line/40 p-1">
        {doc.components.length === 0 ? (
          <li className="px-1 py-2 text-center text-[10px] text-fg-mute">Aucun dipôle : commencez par « Poser en série ».</li>
        ) : (
          doc.components.map((part) => (
            <li
              key={part.id}
              className={cn(
                'flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px]',
                state.selectedId === part.id ? 'bg-ink-800 text-fg' : 'text-fg-soft',
              )}
            >
              <span className="font-mono text-[9.5px] text-spark-cyan">{part.label ?? '—'}</span>
              <span className="truncate">{COMPONENT_META[part.kind].label}</span>
              <span className="ml-auto shrink-0 font-mono text-[9px] text-fg-mute">
                {nodeNames.get(part.a) ?? part.a} → {nodeNames.get(part.b) ?? part.b}
              </span>
              {doc.ground === part.a || doc.ground === part.b ? (
                <span className="shrink-0 rounded bg-spark-green/15 px-1 text-[8.5px] text-spark-green">masse</span>
              ) : null}
              <button
                type="button"
                onClick={() => apply((current) => removePart(current, part.id))}
                className="shrink-0 rounded p-0.5 text-fg-mute hover:text-spark-rose"
                aria-label={`Supprimer ${part.label ?? COMPONENT_META[part.kind].label}`}
              >
                <Trash2 size={10} />
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="flex items-center gap-1">
        <span className="font-mono text-[9px] text-fg-mute">
          curseur N{nodeIndex(doc, activeNode) ?? '—'} · {activeCell.x},{activeCell.y}
        </span>
        <button
          type="button"
          onClick={() => {
            setCursor(ORIGIN);
            setSeries(false);
          }}
          className="ml-auto rounded p-1 text-fg-mute hover:text-fg"
          aria-label="Remettre le curseur à l’origine"
        >
          <RotateCcw size={10} />
        </button>
        <button type="button" onClick={clear} className="rounded p-1 text-fg-mute hover:text-spark-rose" aria-label="Vider le plan">
          <Trash2 size={10} />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function nodeIndex(doc: EditorState['doc'], node: string): number | null {
  const index = nodesOf(doc).indexOf(node);
  return index < 0 ? null : index + 1;
}

function unitOf(kind: ComponentKind): string {
  switch (kind) {
    case 'capacitor':
      return 'F';
    case 'inductor':
      return 'H';
    case 'vsource':
      return 'V';
    case 'isource':
      return 'A';
    case 'resistor':
    case 'potentiometer':
      return 'Ω';
    default:
      return '';
  }
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '?';
  const abs = Math.abs(value);
  const prefixes: Array<[number, string]> = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  for (const [scale, prefix] of prefixes) {
    if (abs >= scale) {
      const scaled = value / scale;
      return `${Number(scaled.toFixed(scaled < 10 ? 2 : 1))}${prefix}`;
    }
  }
  return value.toExponential(1);
}
