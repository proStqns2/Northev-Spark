'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Crown,
  Cpu,
  Loader2,
  Lock,
  Play,
  Send,
  Sparkles,
  Zap,
  Wand2,
} from 'lucide-react';
import { AGENTS, AgentDefinition, AgentId } from '@/lib/ai/agents';
import { AgentReply } from '@/lib/ai/local';
import { CircuitDoc } from '@/lib/engine/types';
import { CircuitThumbnail } from '@/components/studio/CircuitCanvas';
import { cn, downloadBlob } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { TEMPLATES } from '@/lib/data/templates';
import { loadWorkspace } from '@/lib/studio/library';

interface Props {
  user: { id: string; name: string } | null;
  circuitDoc: string | null;
  circuitName: string | null;
  providers: { openai: boolean; gemini: boolean; openrouter?: boolean };
}

export function PremiumClient({ user, circuitDoc, circuitName, providers }: Props) {
  const bundledDoc = useMemo<CircuitDoc | null>(() => {
    if (circuitDoc) {
      try {
        return JSON.parse(circuitDoc) as CircuitDoc;
      } catch {
        return null;
      }
    }
    return null;
  }, [circuitDoc]);

  const [doc, setDoc] = useState<CircuitDoc | null>(bundledDoc);
  const [source, setSource] = useState<'circuit' | 'brouillon' | 'exemple'>(
    bundledDoc ? 'circuit' : 'exemple',
  );

  /**
   * Sans montage passé en URL, on lit le brouillon du studio (localStorage)
   * pour que les agents analysent ce que l'utilisateur vient de construire,
   * et non un exemple génériques. À défaut, un gabarit calculable.
   */
  useEffect(() => {
    if (bundledDoc) return;
    const workspace = loadWorkspace();
    if (workspace && workspace.components.length) {
      setDoc(workspace);
      setSource('brouillon');
      return;
    }
    const fallback = TEMPLATES.find((t) => t.slug === 'equivalence-tn') ?? TEMPLATES[0];
    setDoc(fallback.build());
    setSource('exemple');
  }, [bundledDoc]);
  const [selected, setSelected] = useState<AgentId>('theo');
  const [task, setTask] = useState<string>('equivalence');
  const [question, setQuestion] = useState('');
  const [provider, setProvider] = useState<'auto' | 'local' | 'openai' | 'gemini' | 'openrouter'>('auto');
  const [loading, setLoading] = useState(false);
  const [replies, setReplies] = useState<AgentReply[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { info, error: toastError } = useToast();

  const agent = AGENTS.find((a) => a.id === selected)!;

  useEffect(() => {
    if (agent.tasks.some((t) => t.id === task)) return;
    setTask(agent.tasks[0].id);
  }, [agent, task]);

  async function run(agentId: AgentId = selected, taskId: string = task) {
    if (!user) {
      setError('Connectez-vous pour interroger les agents : le contexte du montage est lié à votre compte.');
      return;
    }
    if (!doc) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: agentId,
          task: taskId,
          doc,
          question: question.trim() || undefined,
          provider,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'L’agent n’a pas pu répondre.');
      setReplies((current) => [payload.reply as AgentReply, ...current].slice(0, 12));
      info(
        `Réponse de ${AGENTS.find((a) => a.id === agentId)?.name}`,
        payload.reply.provider === 'local'
          ? 'Moteur symbolique local (aucune clé requise).'
          : `Réponse générée par ${
              payload.reply.provider === 'openai'
                ? 'OpenAI'
                : payload.reply.provider === 'openrouter'
                  ? 'OpenRouter'
                  : 'Gemini'
            }.`,
      );
    } catch (e) {
      setError((e as Error).message);
      toastError('Échec de l’agent', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function exportReplies() {
    if (!replies.length) return;
    const text = replies
      .map(
        (reply) =>
          `## ${AGENTS.find((a) => a.id === reply.agent)?.name ?? reply.agent} · ${reply.task}\n${reply.headline}\n\n${reply.body}\n\n${reply.checklist?.map((c) => `- ${c}`).join('\n') ?? ''}`,
      )
      .join('\n\n---\n\n');
    downloadBlob(
      `# Rapport des agents IA — ${doc?.name ?? 'montage'}\n\n${text}\n`,
      `agents-${(doc?.name ?? 'montage').toLowerCase().replace(/\s+/g, '-')}.md`,
      'text/markdown',
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
      <header className="relative overflow-hidden rounded-2xl border border-spark-violet/25 bg-gradient-to-br from-ink-900 via-ink-850 to-ink-900 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-spark-violet/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-spark-cyan/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <span className="chip border-spark-violet/40 bg-spark-violet/10 text-spark-violet">
              <Crown size={12} /> Premium · agents spécialisés
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Cinq agents, cinq regards sur votre montage.
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-fg-soft">
              Chaque agent calcule réellement sur votre circuit : ils utilisent le même moteur nodal que le studio,
              puis traduisent le résultat. Sans clé API, le raisonnement symbolique local fonctionne hors ligne ; avec
              une clé, OpenAI ou Gemini rédige l’explication finale.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={cn(
                  'chip',
                  providers.openai ? 'border-spark-green/40 text-spark-green' : 'text-fg-mute',
                )}
              >
                <Bot size={11} /> OpenAI {providers.openai ? 'connecté' : 'non configuré'}
              </span>
              <span
                className={cn(
                  'chip',
                  providers.gemini ? 'border-spark-green/40 text-spark-green' : 'text-fg-mute',
                )}
              >
                <Sparkles size={11} /> Gemini {providers.gemini ? 'connecté' : 'non configuré'}
              </span>
              <span
                className={cn(
                  'chip',
                  providers.openrouter ? 'border-spark-green/40 text-spark-green' : 'text-fg-mute',
                )}
              >
                <Wand2 size={11} /> OpenRouter {providers.openrouter ? 'connecté' : 'non configuré'}
              </span>
              <span className="chip border-spark-cyan/40 text-spark-cyan">
                <Cpu size={11} /> moteur local toujours actif
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!user ? (
              <Link href="/compte?mode=connexion" className="btn btn-primary">
                <Lock size={15} /> Se connecter pour utiliser les agents
              </Link>
            ) : (
              <span className="btn btn-sm border-spark-green/40 text-spark-green">
                <BadgeCheck size={13} /> {user.name}
              </span>
            )}
            <Link href="/bibliotheque" className="text-[11px] text-fg-mute hover:text-fg">
              charger un montage de la bibliothèque
            </Link>
          </div>
        </div>
      </header>

      <div className="mt-5 grid gap-4 xl:grid-cols-[300px_1fr_330px]">
        {/* ---------------------------------------------------------- agents */}
        <aside className="space-y-2">
          <p className="label-xs">Équipe d’agents</p>
          {AGENTS.map((item) => {
            const active = item.id === selected;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition',
                  active
                    ? 'border-spark-cyan/50 bg-spark-cyan/[0.06] shadow-glow-sm'
                    : 'border-line/50 bg-ink-900/60 hover:border-line hover:bg-ink-850',
                )}
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line/60">
                  <Image src={item.avatar} alt={item.name} fill sizes="44px" className="object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold">{item.name}</span>
                    <span
                      className="rounded px-1 py-0.5 font-mono text-[8px] uppercase"
                      style={{ color: item.color, background: `${item.color}18` }}
                    >
                      {item.task}
                    </span>
                  </span>
                  <span className="block text-[10.5px] text-fg-mute">{item.role}</span>
                  <span className="mt-1 block text-[10.5px] leading-snug text-fg-soft">{item.tagline}</span>
                </span>
                {active ? <ChevronRight size={13} className="mt-1 shrink-0 text-spark-cyan" /> : null}
              </button>
            );
          })}

          <div className="panel-soft mt-3 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-soft">
              <CircleDollarSign size={12} className="text-spark-amber" /> Formule Premium
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
              Accès illimité aux cinq agents, exports de rapports, ateliers multiwork étendus et historique cloud.
            </p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-lg font-semibold">0 €</span>
              <span className="text-[10px] text-fg-mute">en démonstration</span>
            </div>
            <button
              type="button"
              onClick={() => info('Démonstration', 'Le hub est ouvert : les agents locaux sont gratuits, les clés API sont optionnelles.')}
              className="btn btn-sm mt-2 w-full border-spark-violet/40 bg-spark-violet/10 text-spark-violet"
            >
              <Crown size={12} /> Activer la démo
            </button>
          </div>
        </aside>

        {/* ------------------------------------------------------------ chat */}
        <section className="flex min-h-[560px] flex-col panel overflow-hidden">
          <div
            className="flex items-center gap-3 border-b border-line/60 p-3"
            style={{ background: `linear-gradient(90deg, ${agent.color}12, transparent)` }}
          >
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-line/60">
              <Image src={agent.avatar} alt={agent.name} fill sizes="40px" className="object-cover" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                {agent.name}
                <span className="rounded px-1 py-0.5 text-[8.5px] uppercase" style={{ color: agent.color, background: `${agent.color}18` }}>
                  {agent.role}
                </span>
              </p>
              <p className="truncate text-[10.5px] text-fg-mute">{agent.description}</p>
            </div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              className="rounded-lg border border-line/60 bg-ink-950/70 px-2 py-1.5 text-[10.5px] text-fg-soft outline-none"
              aria-label="Fournisseur"
            >
              <option value="auto">Auto</option>
              <option value="local">Moteur local</option>
              <option value="openai" disabled={!providers.openai}>
                OpenAI {providers.openai ? '' : '(clé absente)'}
              </option>
              <option value="gemini" disabled={!providers.gemini}>
                Gemini {providers.gemini ? '' : '(clé absente)'}
              </option>
              <option value="openrouter" disabled={!providers.openrouter}>
                OpenRouter {providers.openrouter ? '' : '(clé absente)'}
              </option>
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-line/50 p-2.5">
            {agent.tasks.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTask(item.id);
                  void run(selected, item.id);
                }}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[11px] transition',
                  task === item.id
                    ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan'
                    : 'border-line/50 bg-ink-850/60 text-fg-soft hover:border-line hover:text-fg',
                )}
                title={item.description}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {error ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-spark-coral/40 bg-spark-coral/[0.08] p-2.5 text-[11.5px] text-spark-coral">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
              </p>
            ) : null}

            {!replies.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <span className="relative h-20 w-20 overflow-hidden rounded-2xl border border-line/60">
                  <Image src={agent.avatar} alt={agent.name} fill sizes="80px" className="object-cover" />
                </span>
                <div>
                  <p className="text-[13px] font-medium">{agent.name} est prêt.</p>
                  <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-fg-mute">
                    Lancez une tâche ci-dessus, ou posez une question précise sur le montage chargé
                    {doc?.name ? ` (« ${doc.name} »` : ' ('}
                    {source === 'brouillon'
                      ? ' — votre brouillon du studio'
                      : source === 'circuit'
                        ? ' — circuit enregistré'
                        : ' — gabarit d’exemple'}
                    ).
                  </p>
                </div>
                <button type="button" onClick={() => run()} disabled={loading} className="btn btn-primary btn-sm">
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Lancer « {agent.tasks.find((t) => t.id === task)?.label} »
                </button>
              </div>
            ) : (
              replies.map((reply, index) => (
                <article
                  key={`${reply.agent}-${index}-${reply.task}`}
                  className="rounded-xl border border-line/50 bg-ink-900/60 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: AGENTS.find((a) => a.id === reply.agent)?.color }}>
                      {AGENTS.find((a) => a.id === reply.agent)?.name}
                      <span className="font-normal text-fg-mute">· {reply.task}</span>
                    </p>
                    <span className="chip">
                      {reply.provider === 'local' ? <Cpu size={9} /> : <Sparkles size={9} />} {reply.provider}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-[13px] font-semibold text-fg">{reply.headline}</h3>
                  <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-fg-soft">{reply.body}</p>
                  {reply.metrics.length ? (
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {reply.metrics.map((metric) => (
                        <div key={metric.label} className="rounded-lg border border-line/40 bg-ink-850/60 px-2 py-1">
                          <p className="text-[8.5px] uppercase tracking-wider text-fg-mute">{metric.label}</p>
                          <p className="font-mono text-[10.5px] text-spark-cyan">{metric.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {reply.checklist?.length ? (
                    <ul className="mt-2 space-y-0.5">
                      {reply.checklist.map((item) => (
                        <li key={item} className="flex items-start gap-1 text-[10.5px] text-fg-soft">
                          <Check size={10} className="mt-0.5 shrink-0 text-spark-green" /> {item}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {reply.warning ? (
                    <p className="mt-2 flex items-start gap-1 rounded border border-spark-amber/30 bg-spark-amber/[0.07] px-2 py-1 text-[10px] text-spark-amber">
                      <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {reply.warning}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
            className="flex items-center gap-1.5 border-t border-line/60 p-2.5"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`Poser une question à ${agent.name}…`}
              className="field flex-1"
              maxLength={600}
            />
            <button type="submit" disabled={loading || !user} className="btn btn-primary px-3">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </form>
        </section>

        {/* --------------------------------------------------------- contexte */}
        <aside className="space-y-3">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
              <p className="text-[11px] font-semibold">Montage en contexte</p>
              <Link href="/studio" className="text-[10px] text-spark-cyan hover:underline">
                changer
              </Link>
            </div>
            {doc ? (
              <>
                <div className="h-[150px] canvas-grid bg-ink-950/50">
                  <CircuitThumbnail doc={doc} />
                </div>
                <div className="p-2.5">
                  <p className="text-[11.5px] font-medium">{doc.name}</p>
                  <p className="text-[10px] text-fg-mute">
                    {doc.components.length} dipôles · {doc.regime === 'ac' ? `AC ${doc.frequency} Hz` : 'continu'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {TEMPLATES.slice(0, 4).map((template) => (
                      <button
                        key={template.slug}
                        type="button"
                        onClick={() => setDoc(template.build())}
                        className="rounded border border-line/50 px-1.5 py-0.5 text-[9.5px] text-fg-mute hover:text-fg"
                      >
                        {template.title}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="p-3 text-[11px] text-fg-mute">Aucun montage chargé.</p>
            )}
          </div>

          <div className="panel p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold">
              <Zap size={12} className="text-spark-amber" /> Boucle complète
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
              Le hub peut analyser tout le réseau en une passe : chaque agent traite une dimension (calcul, vérification,
              méthode) et les résultats se recoupent.
            </p>
            <button
              type="button"
              onClick={async () => {
                for (const agentItem of AGENTS.slice(0, 3)) {
                  await run(agentItem.id, agentItem.tasks[0].id);
                }
              }}
              disabled={loading || !user}
              className="btn btn-sm mt-2 w-full border-spark-cyan/40 text-spark-cyan"
            >
              <Play size={11} /> Lancer une analyse croisée
            </button>
          </div>

          <div className="panel p-3">
            <p className="text-[11px] font-semibold">Journal des réponses</p>
            <p className="mt-1 text-[10.5px] text-fg-mute">
              {replies.length ? `${replies.length} réponse(s) dans cette session.` : 'Aucune réponse encore.'}
            </p>
            <button
              type="button"
              onClick={exportReplies}
              disabled={!replies.length}
              className="btn btn-sm mt-2 w-full"
            >
              <ArrowRight size={11} /> Exporter le rapport Markdown
            </button>
          </div>

          <div className="rounded-xl border border-line/40 bg-ink-900/50 p-3">
            <p className="text-[10px] leading-relaxed text-fg-mute">
              Les clés API ne transitent jamais par le navigateur : les appels sont faits dans <code className="font-mono text-fg-soft">/api/ai</code>.
              Sans clé, l’agent local calcule à partir du solveur nodal et de la réduction symbolique.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export type { AgentDefinition };
