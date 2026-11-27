'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CircuitDoc } from '@/lib/engine/types';
import { equivalenceCode, type EquivalenceSummary } from '@/lib/engine/netlist';

/**
 * Onglet « Code » : la description textuelle du montage.
 *
 * C'est ce qui manquait : le studio calculait U_th, Z_th, I_N mais ne montrait
 * jamais le montage sous forme de lignes — la forme qu'on écrit en cours, qu'on
 * recopie dans un rapport ou qu'on colle dans un simulateur SPICE.
 *
 * Le code se met à jour à chaque geste (aucun bouton « générer ») et se copie
 * d'un clic, dans les deux formats.
 */

export interface CodePanelProps {
  doc: CircuitDoc;
  summary?: EquivalenceSummary;
}

export function CodePanel({ doc, summary }: CodePanelProps) {
  const [copied, setCopied] = useState<'text' | 'spice' | null>(null);

  const code = useMemo(
    () => equivalenceCode(doc, summary),
    // dépendances scalaires : le texte ne se recalcule que si le montage change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, summary?.vth, summary?.rth, summary?.inorton],
  );

  const copy = async (which: 'text' | 'spice') => {
    const payload = which === 'text' ? code.text : code.spice;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  const download = () => {
    const blob = new Blob([`${code.text}\n\n* SPICE\n${code.spice}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(code.title || 'montage').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.cir`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2">
      <section className="panel p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-mute">
            <FileCode2 size={11} /> Code d’équivalence
          </p>
          <span className="font-mono text-[9.5px] text-fg-mute">
            {code.entries.length} dipôle(s) · {code.nodes.filter((node) => !node.ground).length} nœud(s)
          </span>
        </div>

        {code.entries.length ? (
          <pre
            aria-label="Code d’équivalence du montage"
            className="mt-2 max-h-[46vh] overflow-auto rounded-lg border border-line/50 bg-ink-950/70 p-2 font-mono text-[10.5px] leading-relaxed text-fg-soft"
          >
            {code.text}
          </pre>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed border-line/60 p-2 text-[10.5px] leading-relaxed text-fg-mute">
            Posez un premier dipôle : son code apparaît ici immédiatement (nœuds nommés, valeur avec unité,
            équivalent de Thévenin).
          </p>
        )}

        <div className="mt-2 grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => void copy('text')}
            className="btn btn-sm justify-center border-line/60 text-[10px]"
            disabled={!code.entries.length}
          >
            {copied === 'text' ? <Check size={11} className="text-spark-green" /> : <Copy size={11} />} Code
          </button>
          <button
            type="button"
            onClick={() => void copy('spice')}
            className="btn btn-sm justify-center border-line/60 text-[10px]"
            disabled={!code.entries.length}
          >
            {copied === 'spice' ? <Check size={11} className="text-spark-green" /> : <Copy size={11} />} SPICE
          </button>
          <button
            type="button"
            onClick={download}
            className="btn btn-sm justify-center border-line/60 text-[10px]"
            disabled={!code.entries.length}
          >
            <Download size={11} /> .cir
          </button>
        </div>
        <p className="mt-1.5 text-[9px] leading-relaxed text-fg-mute">
          Nœuds : masse = <span className="font-mono">0</span>, puis bornes A et B, puis lecture de gauche à droite.
          Les colonnes « SPICE » sont recopiables telles quelles.
        </p>
      </section>

      <section className="panel p-2.5">
        <p className="text-[10px] uppercase tracking-wide text-fg-mute">Table des nœuds</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          {code.nodes.length ? (
            code.nodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center justify-between rounded-md border border-line/40 bg-ink-950/50 px-1.5 py-1 font-mono text-[10px]"
              >
                <span className={cn('font-semibold', node.ground ? 'text-fg-mute' : 'text-spark-cyan')}>
                  {node.id}
                </span>
                <span className="text-fg-mute">{node.cell ?? '—'}</span>
                {node.terminalA ? <span className="text-spark-amber">A</span> : null}
                {node.terminalB ? <span className="text-spark-amber">B</span> : null}
              </div>
            ))
          ) : (
            <p className="col-span-2 text-[10.5px] text-fg-mute">Aucun nœud : le plan est vide.</p>
          )}
        </div>
      </section>
    </div>
  );
}
