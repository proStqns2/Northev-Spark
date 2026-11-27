'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Cpu,
  Gauge,
  Hammer,
  Loader2,
  Play,
  Server,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AgentEmblem } from '@/components/agents/AgentEmblem';
import { cn } from '@/lib/utils';

/**
 * Poste de travail des agents.
 *
 * Chaque tuile du manuel garde son emblème, mais devient **exécutable** : le
 * bouton « Exécuter » envoie `POST /api/agents/:id/run`, que Next.js traite
 * localement ou délègue au service Express (`lib/agents/runtime` dans les deux
 * cas). Le panneau de droite affiche les grandeurs, les étapes et le tableau
 * par branche, puis propose d'ouvrir le montage dans l'atelier.
 *
 * Aucune clé d'API n'est nécessaire : le calcul est déterministe et local.
 */

export interface WorkbenchAgent {
  id: string;
  name: string;
  role: string;
  tagline: string;
  task: string;
  avatar: string;
  color: string;
  template: string;
  tasks: Array<{ id: string; label: string; description: string }>;
}

export interface WorkbenchGroup {
  title: string;
  hint: string;
  ids: string[];
}

interface Metric {
  label: string;
  value: string;
  hint?: string;
}

interface Step {
  title: string;
  detail: string;
  value: string;
}

interface Outcome {
  agent: string;
  name: string;
  role: string;
  task: string;
  ok: boolean;
  summary: string;
  metrics: Metric[];
  steps: Step[];
  warnings: string[];
  table?: { title: string; head: [string, string, string, string]; rows: Array<{ label: string; u: string; i: string; p: string }> };
  studioHref: string;
  engine: { nodes: number; branches: number; ms: number; regime: 'dc' | 'ac' };
}

interface RunResponse {
  ok: boolean;
  servedBy?: 'express' | 'next';
  fallbackReason?: string;
  outcome?: Outcome;
  error?: string;
}

const DEFAULTS = { r: '1k', c: '100n', l: '10m' };

export function AgentWorkbench({
  agents,
  groups,
}: {
  agents: WorkbenchAgent[];
  groups: WorkbenchGroup[];
}) {
  const byId = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const [values, setValues] = useState(DEFAULTS);
  /** les valeurs ne sont envoyées qu'une fois modifiées : sinon l'agent utilise son gabarit */
  const [valuesDirty, setValuesDirty] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [servedBy, setServedBy] = useState<'express' | 'next' | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState<{ reachable: boolean; configured: boolean; latencyMs?: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/agents/health')
      .then((response) => response.json())
      .then((data: { express?: { reachable: boolean; configured: boolean; latencyMs?: number } }) => {
        if (alive && data.express) setService(data.express);
      })
      .catch(() => {
        if (alive) setService({ reachable: false, configured: false });
      });
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(
    async (agent: WorkbenchAgent, task?: string) => {
      setRunning(agent.id);
      setError(null);
      try {
        const response = await fetch(`/api/agents/${agent.id}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, ...(valuesDirty ? { values } : {}) }),
        });
        const data = (await response.json()) as RunResponse;
        if (!response.ok || !data.outcome) {
          setError(data.error ?? `L’agent ${agent.name} n’a pas pu répondre (HTTP ${response.status}).`);
          setOutcome(null);
          return;
        }
        setOutcome(data.outcome);
        setServedBy(data.servedBy ?? null);
        setFallback(data.fallbackReason ?? null);
        // sur téléphone, le panneau est au-dessus : on l'amène à l'écran
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches) {
          panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch {
        setError('Réseau indisponible : réessayez.');
        setOutcome(null);
      } finally {
        setRunning(null);
      }
    },
    [values, valuesDirty],
  );

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ------------------------------------------------------------ tuiles */}
      <div>
        {/* valeurs partagées par tous les agents */}
        <div className="panel flex flex-wrap items-center gap-2 p-2">
          <span className={cn('chip', valuesDirty ? 'border-spark-cyan/40 text-spark-cyan' : '')}>
            <Gauge size={10} /> {valuesDirty ? 'valeurs imposées' : 'gabarit de l’agent'}
          </span>
          {(
            [
              ['r', 'R'],
              ['c', 'C'],
              ['l', 'L'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1 rounded-md border border-line/50 px-1.5 py-1">
              <span className="font-mono text-[10px] text-fg-mute">{label}</span>
              <input
                value={values[key]}
                onChange={(event) => {
                  setValuesDirty(true);
                  setValues((current) => ({ ...current, [key]: event.target.value }));
                }}
                aria-label={`Valeur ${label}`}
                className="w-14 bg-transparent font-mono text-[11px] text-fg outline-none"
              />
            </label>
          ))}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-fg-mute">
            {service === null ? (
              <>
                <Loader2 size={10} className="animate-spin" /> vérification du service…
              </>
            ) : service.reachable ? (
              <>
                <Server size={10} className="text-spark-green" /> Express joignable
                {service.latencyMs !== undefined ? ` · ${service.latencyMs} ms` : ''}
              </>
            ) : (
              <>
                <Cpu size={10} className="text-spark-cyan" /> calcul Next (Express {service.configured ? 'muet' : 'non configuré'})
              </>
            )}
          </span>
        </div>

        {groups.map((group) => (
          <section key={group.title} className="mt-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="label-xs">{group.title}</p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{group.hint}</h2>
              </div>
              <span className="chip">{group.ids.length} agents</span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.ids.map((id) => {
                const agent = byId.get(id);
                if (!agent) return null;
                const busy = running === agent.id;
                const active = outcome?.agent === agent.id;
                return (
                  <article
                    key={agent.id}
                    data-agent-id={agent.id}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-2xl border bg-ink-900/60 transition',
                      active ? 'border-spark-cyan/60' : 'border-line/60 hover:border-line',
                    )}
                  >
                    <Link
                      href={`/studio?template=${agent.template}&agent=${agent.id}`}
                      className="relative block aspect-[16/9] overflow-hidden bg-[#0b1220]"
                      aria-label={`Construire le montage de l’agent ${agent.name}`}
                    >
                      <Image
                        src={agent.avatar}
                        alt=""
                        aria-hidden="true"
                        width={340}
                        height={191}
                        className="h-full w-full object-cover opacity-45 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-60"
                        unoptimized
                      />
                      {/* voile : garantit le contraste du texte sur n'importe quelle tuile */}
                      <span
                        aria-hidden="true"
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(150deg, ${agent.color}33 0%, #0b1220d9 55%, #0b1220f2 100%)`,
                        }}
                      />
                      <span className="absolute left-2.5 top-2.5 flex items-center gap-2">
                        <AgentEmblem id={agent.id} size={30} color={agent.color} className="shadow-lg shadow-black/40" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-white drop-shadow">{agent.name}</span>
                          <span className="block truncate text-[9.5px] text-white/60">{agent.role}</span>
                        </span>
                      </span>
                      <span className="absolute bottom-2 right-2 rounded border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-white/70 backdrop-blur-sm">
                        {agent.template}
                      </span>
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 h-px"
                        style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }}
                      />
                    </Link>

                    <div className="flex flex-1 flex-col p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-[10.5px] leading-relaxed text-fg-soft">{agent.tagline}</p>
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8.5px] uppercase"
                          style={{ color: agent.color, background: `${agent.color}18` }}
                          title={`Tâche par défaut : ${agent.task}`}
                        >
                          {agent.task}
                        </span>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => void run(agent)}
                          disabled={busy}
                          className="btn btn-primary btn-sm justify-center text-[10.5px]"
                          aria-label={`Exécuter l’agent ${agent.name}`}
                        >
                          {busy ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                          {busy ? 'Calcul…' : 'Exécuter'}
                        </button>
                        <Link
                          href={`/studio?template=${agent.template}&agent=${agent.id}`}
                          className="btn btn-ghost btn-sm justify-center text-[10px]"
                        >
                          <Hammer size={10} /> Studio
                        </Link>
                      </div>
                      <div className="mt-1.5">
                        <p className="font-mono text-[8px] uppercase tracking-wide text-fg-mute">tâches calculées</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {agent.tasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              disabled={busy}
                              onClick={() => void run(agent, task.id)}
                              aria-pressed={active && outcome?.task === task.id}
                              className={cn(
                                'rounded border px-1.5 py-0.5 text-[9px] transition disabled:opacity-50',
                                active && outcome?.task === task.id
                                  ? 'border-spark-cyan/50 bg-spark-cyan/10 text-spark-cyan'
                                  : 'border-line/50 text-fg-mute hover:border-line hover:text-fg-soft',
                              )}
                              title={task.description}
                            >
                              {task.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ---------------------------------------------------------- résultat */}
      <div ref={panelRef} className="lg:sticky lg:top-16 lg:self-start">
        <section className="panel flex flex-col gap-2 p-3" data-testid="agent-outcome">
          <header className="flex items-center gap-1.5">
            <Sparkles size={12} className="text-spark-violet" />
            <h2 className="text-[12px] font-medium">Sortie d’agent</h2>
            {servedBy ? (
              <span
                className={cn(
                  'ml-auto rounded px-1.5 py-0.5 font-mono text-[8.5px] uppercase',
                  servedBy === 'express' ? 'bg-spark-green/15 text-spark-green' : 'bg-spark-cyan/15 text-spark-cyan',
                )}
                title={fallback ?? `Calcul exécuté par ${servedBy}`}
              >
                {servedBy === 'express' ? 'servi par express' : 'servi par next'}
              </span>
            ) : null}
            {outcome ? (
              <button
                type="button"
                onClick={() => setOutcome(null)}
                className={cn('rounded p-1 text-fg-mute hover:text-fg', servedBy ? '' : 'ml-auto')}
                aria-label="Fermer la sortie"
              >
                <X size={11} />
              </button>
            ) : null}
          </header>

          {error ? (
            <p className="rounded-lg border border-spark-rose/40 bg-spark-rose/[0.06] px-2 py-1.5 text-[10.5px] text-spark-rose">
              {error}
            </p>
          ) : null}

          {!outcome && !error ? (
            <div className="flex flex-col gap-1.5 py-6 text-center">
              <p className="text-[11px] text-fg-soft">Aucun agent exécuté.</p>
              <p className="mx-auto max-w-[30ch] text-[10px] leading-relaxed text-fg-mute">
                Choisissez « Exécuter » sur une tuile : le calcul se fait sur le serveur, sans clé d’API, en quelques
                millisecondes.
              </p>
            </div>
          ) : null}

          {outcome ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-line/50 bg-ink-950/60 p-2">
                <AgentEmblem
                  id={outcome.agent}
                  size={28}
                  color={byId.get(outcome.agent)?.color}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1 text-[11.5px] font-medium">
                    {outcome.ok ? <Check size={12} className="text-spark-green" /> : <TriangleAlert size={12} className="text-spark-amber" />}
                    {outcome.name}
                    <span className="font-mono text-[9px] text-fg-mute">· {outcome.role}</span>
                    <span className="rounded bg-spark-cyan/10 px-1 font-mono text-[8.5px] uppercase text-spark-cyan">
                      {outcome.task}
                    </span>
                  </p>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-fg-soft">{outcome.summary}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-1">
                {outcome.metrics.map((metric) => (
                  <div key={metric.label} className="rounded-md border border-line/40 px-1.5 py-1">
                    <dt className="font-mono text-[8.5px] uppercase text-fg-mute">{metric.label}</dt>
                    <dd className="font-mono text-[11px] text-fg">{metric.value}</dd>
                    {metric.hint ? <p className="text-[8.5px] text-fg-mute">{metric.hint}</p> : null}
                  </div>
                ))}
              </dl>

              {outcome.table ? (
                <div className="overflow-x-auto rounded-md border border-line/40">
                  <table className="w-full text-[9.5px]">
                    <caption className="px-1.5 py-1 text-left text-[9.5px] text-fg-mute">{outcome.table.title}</caption>
                    <thead className="bg-ink-850/60 text-fg-mute">
                      <tr>
                        {outcome.table.head.map((cell) => (
                          <th key={cell} className="px-1.5 py-1 text-left font-medium">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {outcome.table.rows.map((row) => (
                        <tr key={row.label} className="border-t border-line/30">
                          <td className="px-1.5 py-0.5 font-mono">{row.label}</td>
                          <td className="px-1.5 py-0.5 font-mono">{row.u}</td>
                          <td className="px-1.5 py-0.5 font-mono">{row.i}</td>
                          <td className="px-1.5 py-0.5 font-mono">{row.p}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {outcome.steps.length ? (
                <ol className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                  {outcome.steps.map((step, index) => (
                    <li key={`${step.title}-${index}`} className="rounded-md border border-line/40 px-1.5 py-1">
                      <p className="flex items-baseline gap-1 text-[10px] font-medium text-fg-soft">
                        <span className="font-mono text-[8.5px] text-spark-cyan">{index + 1}</span>
                        {step.title}
                        <span className="ml-auto font-mono text-[9px] text-spark-cyan">{step.value}</span>
                      </p>
                      <p className="mt-0.5 text-[9.5px] leading-relaxed text-fg-mute">{step.detail}</p>
                    </li>
                  ))}
                </ol>
              ) : null}

              {outcome.warnings.length ? (
                <ul className="space-y-0.5">
                  {outcome.warnings.slice(0, 3).map((warning, index) => (
                    <li key={`${warning}-${index}`} className="flex items-start gap-1 text-[9.5px] text-spark-amber">
                      <TriangleAlert size={9} className="mt-0.5 shrink-0" /> {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              <footer className="flex items-center gap-1.5 border-t border-line/40 pt-1.5">
                <span className="font-mono text-[8.5px] text-fg-mute">
                  {outcome.engine.nodes} nœuds · {outcome.engine.branches} branches · {outcome.engine.ms} ms ·{' '}
                  {outcome.engine.regime.toUpperCase()}
                </span>
                <Link href={outcome.studioHref} className="btn btn-sm ml-auto justify-center text-[10px]">
                  Ouvrir dans le Studio <ArrowRight size={10} />
                </Link>
              </footer>
            </>
          ) : null}
        </section>

        <p className="mt-2 px-1 text-[9.5px] leading-relaxed text-fg-mute">
          Le calcul est le même module côté Next et côté Express :{' '}
          <code className="text-fg-soft">lib/agents/runtime.ts</code>. Le badge indique le serveur qui a répondu, et le
          survol donne la raison d’un repli éventuel.
        </p>
      </div>
    </div>
  );
}

export function ProviderChips({
  status,
}: {
  status: { openrouter: boolean; gemini: boolean; openai: boolean };
}) {
  return (
    <>
      <span className={`chip ${status.openrouter ? 'border-spark-green/40 text-spark-green' : ''}`}>
        OpenRouter {status.openrouter ? 'connecté' : 'non configuré'}
      </span>
      <span className={`chip ${status.gemini ? 'border-spark-green/40 text-spark-green' : ''}`}>
        Gemini {status.gemini ? 'connecté' : 'non configuré'}
      </span>
      <span className={`chip ${status.openai ? 'border-spark-green/40 text-spark-green' : ''}`}>
        OpenAI {status.openai ? 'connecté' : 'non configuré'}
      </span>
      <span className="chip border-spark-cyan/40 text-spark-cyan">
        <Cpu size={10} /> moteur local toujours actif
      </span>
    </>
  );
}
