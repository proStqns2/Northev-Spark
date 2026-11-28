'use client';

import { Cable, CircleDot, Minus, Plus, RotateCw, Trash2, Zap } from 'lucide-react';
import type { ComponentKind } from '@/lib/engine/types';
import type { Tool } from '@/lib/studio/editor';
import { cn } from '@/lib/utils';

/**
 * Barre d'action rapide, collée sous le plan.
 *
 * Sur téléphone, la palette latérale peut être hors écran : cette barre
 * garantit qu'on peut **toujours** poser une pièce, tracer un fil, mettre une
 * masse et calculer, sans faire défiler la page. Les cibles font 40 px.
 */

const PARTS: Array<{ kind: ComponentKind; label: string; short: string; color: string }> = [
  { kind: 'resistor', label: 'Résistance', short: 'R', color: '#38e1e6' },
  { kind: 'capacitor', label: 'Condensateur', short: 'C', color: '#46e6a0' },
  { kind: 'inductor', label: 'Bobine', short: 'L', color: '#a479ff' },
  { kind: 'vsource', label: 'Source de tension', short: 'E', color: '#ffc266' },
  { kind: 'isource', label: 'Source de courant', short: 'I', color: '#4f9dff' },
  { kind: 'switch', label: 'Interrupteur', short: 'K', color: '#f2f5f8' },
];

export interface QuickBarProps {
  tool: Tool;
  onTool: (tool: Tool) => void;
  onSolve: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDelete: () => void;
  onRotate: () => void;
  hasSelection: boolean;
  className?: string;
}

export function QuickBar({
  tool,
  onTool,
  onSolve,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDelete,
  onRotate,
  hasSelection,
  className,
}: QuickBarProps) {
  return (
    <div className={cn('panel flex flex-col gap-1.5 p-1.5', className)}>
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
        {PARTS.map((part) => {
          const active = tool.mode === 'place' && tool.kind === part.kind;
          return (
            <button
              key={part.kind}
              type="button"
              onClick={() => onTool({ mode: 'place', kind: part.kind })}
              title={part.label}
              aria-label={`Poser ${part.label}`}
              className={cn(
                'flex h-10 min-w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 transition',
                active ? 'border-spark-cyan/70 bg-spark-cyan/15 text-fg' : 'border-line/50 text-fg-soft hover:border-line',
              )}
            >
              <span className="h-1 w-4 rounded-full" style={{ background: part.color }} />
              <span className="text-[9.5px] font-medium leading-none">{part.short}</span>
            </button>
          );
        })}

        <span className="mx-0.5 h-8 w-px shrink-0 bg-line/60" />

        <button
          type="button"
          onClick={() => onTool({ mode: 'wire' })}
          title="Tracer un fil"
          className={cn(
            'flex h-10 min-w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 transition',
            tool.mode === 'wire' ? 'border-spark-cyan/70 bg-spark-cyan/15 text-fg' : 'border-line/50 text-fg-soft hover:border-line',
          )}
        >
          <Cable size={13} />
          <span className="text-[9.5px] leading-none">Fil</span>
        </button>
        <button
          type="button"
          onClick={() => onTool({ mode: 'ground' })}
          title="Poser la masse"
          className={cn(
            'flex h-10 min-w-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 transition',
            tool.mode === 'ground' ? 'border-spark-green/70 bg-spark-green/15 text-fg' : 'border-line/50 text-fg-soft hover:border-line',
          )}
        >
          <CircleDot size={13} />
          <span className="text-[9.5px] leading-none">Masse</span>
        </button>

        <span className="mx-0.5 h-8 w-px shrink-0 bg-line/60" />

        <button type="button" onClick={onUndo} disabled={!canUndo} title="Annuler" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 text-fg-soft disabled:opacity-35">
          <Minus size={14} />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Rétablir" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 text-fg-soft disabled:opacity-35">
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={onRotate}
          disabled={!hasSelection}
          title="Pivoter"
          className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 text-fg-soft disabled:opacity-35"
        >
          <RotateCw size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!hasSelection}
          title="Supprimer"
          className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 text-spark-rose/80 disabled:opacity-35"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <button type="button" onClick={onSolve} className="btn btn-primary h-9 w-full text-[12px]">
        <Zap size={13} /> Calculer et afficher les résultats
      </button>
    </div>
  );
}
