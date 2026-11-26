'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { CircuitDoc } from '@/lib/engine/types';
import { formatSI } from '@/lib/engine/format';
import { cn } from '@/lib/utils';

/**
 * Assistant Gemini du studio.
 *
 * Deux actions, toutes deux *proposées* puis *validées* côté serveur :
 *  - « Schéma équivalent » : Gemini propose un montage équivalent, le serveur
 *    le recalcule avec le solveur et renvoie l'écart mesuré ;
 *  - « Rééquilibrer » : correction purement déterministe (aucun appel IA) qui
 *    répare bornes, masse, valeurs et sources mal branchées.
 *
 * La clé API ne transite jamais par ce composant : il n'appelle que
 * `/api/ai/schema` et `/api/ai/balance`.
 */

interface SchemaCheck {
  vthExpected: number;
  vthProposed: number;
  rthExpected: number;
  rthProposed: number;
  deviationPct: number;
  accepted: boolean;
}

interface SchemaResult {
  ok: boolean;
  doc?: CircuitDoc;
  explanation: string;
  model: string;
  check?: SchemaCheck;
  warning?: string;
  error?: string;
}

interface Fix {
  code: string;
  severity: 'correction' | 'conseil';
  message: string;
  componentId?: string;
}

interface BalanceResult {
  doc: CircuitDoc;
  fixes: Fix[];
  changed: boolean;
  status: { ok: boolean; error?: string; vth: number; rth: number; inorton: number };
  before: { ok: boolean; error?: string };
}

export function GeminiHelp({
  doc,
  configured,
  model,
  onApply,
  onClose,
}: {
  doc: CircuitDoc;
  configured: boolean;
  model: string;
  onApply: (doc: CircuitDoc, label: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<'schema' | 'balance' | null>(null);
  const [result, setResult] = useState<SchemaResult | null>(null);
  const [balance, setBalance] = useState<BalanceResult | null>(null);
  const [prompt, setPrompt] = useState('');
  const [shape, setShape] = useState<'thevenin' | 'norton' | 'auto'>('auto');
  const [error, setError] = useState<string | null>(null);

  async function askSchema() {
    setBusy('schema');
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/ai/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc, question: prompt || undefined, shape }),
      });
      const payload = await response.json();
      if (!response.ok && payload.error) throw new Error(payload.error);
      setResult(payload as SchemaResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function askBalance() {
    setBusy('balance');
    setError(null);
    setBalance(null);
    try {
      const response = await fetch('/api/ai/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Rééquilibrage impossible.');
      setBalance(payload as BalanceResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-spark-cyan/30 bg-ink-900 shadow-panel">
        {/* ---------------------------------------------------------- en-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-line/60 bg-gradient-to-r from-spark-cyan/[0.08] to-spark-violet/[0.08] px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan">
              <Sparkles size={16} />
            </span>
            <div>
              <p className="text-[14px] font-semibold">Assistant IA du studio</p>
              <p className="text-[11px] text-fg-mute">
                {configured ? (
                  <>
                    Modèle <span className="font-mono text-fg-soft">{model}</span> · clé côté serveur uniquement ·{' '}
                    <a href="/compte?onglet=cles" className="underline decoration-dotted hover:text-fg-soft">
                      gérer mes clés
                    </a>
                  </>
                ) : (
                  'Clé Gemini non configurée sur ce serveur'
                )}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-fg-mute hover:text-fg" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!configured ? (
            <div className="rounded-xl border border-spark-amber/40 bg-spark-amber/[0.07] p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-spark-amber">
                <AlertTriangle size={13} /> Assistant indisponible
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-fg-soft">
                Ajoutez <code className="rounded bg-ink-850 px-1">GEMINI_API_KEY</code> dans{' '}
                <code className="rounded bg-ink-850 px-1">.env.local</code> (ou dans les variables d’environnement
                Vercel), puis redémarrez le serveur. La clé reste exclusivement côté serveur : elle n’est jamais
                envoyée au navigateur.
              </p>
              <p className="mt-2 text-[10.5px] text-fg-mute">
                Le bouton « Rééquilibrer » reste utilisable sans clé : il fonctionne avec le moteur local, qui
                garantit l’exactitude du résultat même sans modèle de langage.
              </p>
              <a
                href="/compte?onglet=cles"
                className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-spark-cyan underline decoration-dotted hover:text-fg"
              >
                Enregistrer ma propre clé Gemini ou OpenRouter →
              </a>
            </div>
          ) : null}

          {/* --------------------------------------------------- deux actions */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line/50 bg-ink-850/50 p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium">
                <Wand2 size={13} className="text-spark-violet" /> Schéma équivalent
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
                Gemini propose un montage Thévenin ou Norton ; le solveur le recalcule et mesure l’écart.
              </p>
              <div className="mt-2 flex gap-1">
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'thevenin', label: 'Thévenin' },
                    { id: 'norton', label: 'Norton' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setShape(item.id)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[10px] transition',
                      shape === item.id
                        ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                        : 'border-line/50 text-fg-mute hover:text-fg-soft',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Précision (facultatif)…"
                className="field mt-2 text-[11px]"
                maxLength={300}
              />
              <button
                type="button"
                onClick={askSchema}
                disabled={!configured || busy !== null}
                className="btn btn-primary btn-sm mt-2 w-full"
              >
                {busy === 'schema' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Générer avec Gemini
              </button>
            </div>

            <div className="rounded-xl border border-line/50 bg-ink-850/50 p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium">
                <RotateCcw size={13} className="text-spark-green" /> Rééquilibrer
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
                Contrôle physique déterministe : bornes, masse, valeurs nulles, sources court-circuitées ou ouvertes.
              </p>
              <div className="mt-2 rounded-md border border-line/40 bg-ink-950/40 p-2">
                <p className="text-[9.5px] leading-relaxed text-fg-mute">
                  10 contrôles, aucune valeur inventée : seules les incohérences sont corrigées.
                </p>
              </div>
              <button
                type="button"
                onClick={askBalance}
                disabled={busy !== null}
                className="btn btn-sm mt-2 w-full border-spark-green/40 text-spark-green"
              >
                {busy === 'balance' ? <Loader2 size={12} className="animate-spin" /> : <Cpu size={12} />}
                Analyser et rééquilibrer
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-3 rounded-lg border border-spark-coral/40 bg-spark-coral/[0.08] p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-spark-coral">
                <AlertTriangle size={12} /> {error}
              </p>
            </div>
          ) : null}

          {/* ------------------------------------------------ résultat schéma */}
          {result ? (
            <div className="mt-3 rounded-xl border border-line/60 bg-ink-850/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold">
                  {result.ok ? 'Schéma équivalent certifié' : 'Proposition à vérifier'}
                </p>
                <span
                  className={cn(
                    'chip',
                    result.ok
                      ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
                      : 'border-spark-amber/40 bg-spark-amber/10 text-spark-amber',
                  )}
                >
                  {result.ok ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                  {result.check ? `écart ${result.check.deviationPct} %` : result.model}
                </span>
              </div>

              {result.check ? (
                <dl className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[10px]">
                  <div className="rounded border border-line/40 bg-ink-950/50 px-2 py-1">
                    <dt className="text-fg-mute">U_th attendu</dt>
                    <dd className="text-spark-cyan">{formatSI(result.check.vthExpected, 'V', { digits: 4 })}</dd>
                  </div>
                  <div className="rounded border border-line/40 bg-ink-950/50 px-2 py-1">
                    <dt className="text-fg-mute">U_th proposé</dt>
                    <dd className="text-spark-cyan">{formatSI(result.check.vthProposed, 'V', { digits: 4 })}</dd>
                  </div>
                </dl>
              ) : null}

              {result.explanation ? (
                <p className="mt-2 text-[11px] leading-relaxed text-fg-soft">{result.explanation}</p>
              ) : null}
              {result.warning ? (
                <p className="mt-2 text-[10.5px] leading-relaxed text-spark-amber">{result.warning}</p>
              ) : null}
              {result.error ? (
                <p className="mt-2 text-[10.5px] leading-relaxed text-spark-coral">{result.error}</p>
              ) : null}

              {result.doc ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {result.doc.components.map((c) => (
                    <span key={c.id} className="chip font-mono">
                      {c.id} · {c.kind} · {formatSI(c.value, '')}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      onApply(result.doc!, 'Schéma équivalent Gemini');
                      onClose();
                    }}
                    className="btn btn-sm ml-auto border-spark-cyan/40 text-spark-cyan"
                  >
                    Remplacer le montage <ArrowRight size={12} />
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ---------------------------------------------- résultat balance */}
          {balance ? (
            <div className="mt-3 rounded-xl border border-line/60 bg-ink-850/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold">Rapport de rééquilibrage</p>
                <span
                  className={cn(
                    'chip',
                    balance.status.ok
                      ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
                      : 'border-spark-coral/40 bg-spark-coral/10 text-spark-coral',
                  )}
                >
                  {balance.status.ok ? 'calculable' : 'incomplet'}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[10px]">
                {[
                  { label: 'U_th', value: balance.status.vth, unit: 'V' },
                  { label: 'Z_th', value: balance.status.rth, unit: 'Ω' },
                  { label: 'I_N', value: balance.status.inorton, unit: 'A' },
                ].map((item) => (
                  <div key={item.label} className="rounded border border-line/40 bg-ink-950/50 px-2 py-1">
                    <p className="text-fg-mute">{item.label}</p>
                    <p className="text-fg">{Number.isFinite(item.value) ? formatSI(item.value, item.unit, { digits: 3 }) : '∞'}</p>
                  </div>
                ))}
              </div>

              {balance.fixes.length ? (
                <ul className="mt-2 space-y-1">
                  {balance.fixes.map((fix, index) => (
                    <li key={`${fix.code}-${index}`} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed">
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 rounded px-1 text-[8.5px] font-semibold uppercase',
                          fix.severity === 'correction'
                            ? 'bg-spark-cyan/15 text-spark-cyan'
                            : 'bg-spark-amber/15 text-spark-amber',
                        )}
                      >
                        {fix.severity === 'correction' ? 'corrigé' : 'conseil'}
                      </span>
                      <span className="text-fg-soft">{fix.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-spark-green">
                  <CheckCircle2 size={12} /> Aucune incohérence détectée : le montage est déjà équilibré.
                </p>
              )}

              {balance.changed ? (
                <button
                  type="button"
                  onClick={() => {
                    onApply(balance.doc, 'Montage rééquilibré');
                    onClose();
                  }}
                  className="btn btn-sm mt-2 w-full border-spark-green/40 text-spark-green"
                >
                  Appliquer les corrections <ArrowRight size={12} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="border-t border-line/60 bg-ink-950/40 px-4 py-2">
          <p className="text-[9.5px] leading-relaxed text-fg-mute">
            La clé API n’est jamais exposée au navigateur : seules les requêtes serveur→Google l’utilisent. Toute
            proposition est recalculée localement avant d’être acceptable.
          </p>
        </div>
      </div>
    </div>
  );
}
