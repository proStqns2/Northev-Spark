'use client';

import { useState } from 'react';
import { Bot, CheckCircle2, Loader2, Sparkles, TriangleAlert, Wand2 } from 'lucide-react';
import type { CircuitDoc } from '@/lib/engine/types';
import { cn } from '@/lib/utils';

/**
 * « Décrivez votre montage ».
 *
 * Rien ne part sans un clic explicite sur le bouton. Si l'assistant est éteint
 * ou le réseau coupé, le moteur local répond quand même : la zone affiche
 * toujours d'où vient le montage (`local` ou `modele`) et ce qui a été vérifié.
 */

interface BuildResponse {
  ok: boolean;
  doc?: CircuitDoc;
  source?: 'local' | 'modele';
  explanation?: string;
  model?: string;
  provider?: string;
  warnings?: string[];
  issues?: Array<{ level: string; message: string }>;
  error?: string;
}

const EXAMPLES = [
  'Diviseur de tension 12 V qui donne 3 V en sortie',
  'Thévenin avec une charge de 1 kΩ',
  'Pont de Wheatstone à quatre résistances',
  'RC série à 1 kHz avec C = 100 nF',
  'Deux sources et une résistance (Millman)',
];

export function BuildPanel({ onDoc }: { onDoc: (doc: CircuitDoc, message: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BuildResponse | null>(null);

  async function build() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/ai/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const payload = (await response.json()) as BuildResponse;
      setResult(payload);
      if (payload.ok && payload.doc) {
        onDoc(payload.doc, payload.explanation ?? 'Montage construit.');
      }
    } catch {
      setResult({ ok: false, error: 'Serveur injoignable : vérifiez que le site tourne.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-spark-violet/30 bg-spark-violet/[0.05] p-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium">
          <Wand2 size={12} className="text-spark-violet" /> Décrire un montage
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-fg-mute">
          Une phrase suffit. Le moteur local répond toujours ; le modèle n’est appelé que si vous l’avez activé.
        </p>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          placeholder="Ex. : un diviseur de tension 12 V qui donne 3 V, avec une charge de 1 kΩ"
          className="input mt-1.5 w-full resize-none text-[11.5px]"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-line/60 px-2 py-0.5 text-[9.5px] text-fg-mute transition hover:border-spark-violet/50 hover:text-fg-soft"
            >
              {example}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void build()}
          disabled={busy || prompt.trim().length < 6}
          className="btn btn-primary btn-sm mt-2 w-full"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Construire
        </button>
      </div>

      {result ? (
        <div
          className={cn(
            'rounded-xl border p-2.5',
            result.ok ? 'border-spark-green/40 bg-spark-green/[0.05]' : 'border-spark-rose/40 bg-spark-rose/[0.05]',
          )}
        >
          <p className={cn('flex items-center gap-1.5 text-[10.5px] font-medium', result.ok ? 'text-spark-green' : 'text-spark-rose')}>
            {result.ok ? <CheckCircle2 size={11} /> : <TriangleAlert size={11} />}
            {result.ok ? 'Montage prêt' : 'Échec'}
            {result.ok ? (
              <span className="ml-auto flex items-center gap-1 rounded-full border border-line/60 px-1.5 py-0.5 text-[9px] text-fg-mute">
                <Bot size={9} />
                {result.source === 'modele' ? `modèle ${result.provider ?? ''}` : 'moteur local'}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-fg-soft">{result.explanation ?? result.error}</p>
          {result.warnings?.length ? (
            <ul className="mt-1 space-y-0.5">
              {result.warnings.slice(0, 3).map((warning) => (
                <li key={warning} className="text-[9.5px] text-spark-amber">
                  • {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
