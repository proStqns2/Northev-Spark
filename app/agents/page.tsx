import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Cpu, Sparkles, Zap } from 'lucide-react';
import { AGENTS } from '@/lib/ai/agents';
import { providerStatus } from '@/lib/ai/providers';

export const metadata: Metadata = {
  title: 'Agents IA',
  description:
    'Les dix agents de Northev Spark : Thévenin série, Norton parallèle, équivalence T⇄N, Thévenin AC, Norton AC, dipôles équivalents, labo T–N, transformation de sources, hub principal et bobines.',
};

export const dynamic = 'force-dynamic';

const GROUPES: Array<{ title: string; hint: string; ids: string[] }> = [
  {
    title: 'Modèles continus',
    hint: 'Le régime DC : sources, résistances, diviseurs.',
    ids: ['theo', 'nora', 'convert', 'dipoles'],
  },
  {
    title: 'Régime sinusoïdal',
    hint: 'Impédances complexes, bobines et condensateurs.',
    ids: ['impeda', 'coils', 'sources'],
  },
  {
    title: 'Laboratoire & pilotage',
    hint: 'Mesures, audit et coordination des agents.',
    ids: ['lab', 'hub', 'volt'],
  },
];

export default function AgentsPage() {
  const status = providerStatus();
  const byId = new Map<string, (typeof AGENTS)[number]>(AGENTS.map((agent) => [agent.id as string, agent]));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <header>
        <span className="chip border-spark-violet/40 bg-spark-violet/[0.08] text-spark-violet">
          <Sparkles size={12} /> Équipe d’agents
        </span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Les agents qui trouvent l’équivalent
        </h1>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-fg-soft">
          Dix agents spécialisés, chacun avec son emblème : quatre travaillent en régime continu, trois en
          sinusoïdal, trois forment le laboratoire et le pilotage. Tous s’appuient sur le même solveur nodal ; le
          modèle de langage ne fait que rédiger l’explication finale — il ne calcule jamais à votre place.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip">
            <Zap size={10} /> {AGENTS.length} agents
          </span>
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
        </div>
      </header>

      {GROUPES.map((groupe) => (
        <section key={groupe.title} className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="label-xs">{groupe.title}</p>
              <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{groupe.hint}</h2>
            </div>
            <span className="chip">{groupe.ids.length} agents</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groupe.ids.map((id) => {
              const agent = byId.get(id);
              if (!agent) return null;
              return (
                <article
                  key={agent.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-line/60 bg-ink-900/60 transition hover:border-line"
                >
                  {/* la tuile du manuel */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#0b1220]">
                    <Image
                      src={agent.avatar}
                      alt={`Emblème de l’agent ${agent.name} — ${agent.role}`}
                      width={340}
                      height={255}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                      unoptimized
                    />
                    <span
                      className="absolute inset-x-0 bottom-0 h-px"
                      style={{ background: `linear-gradient(90deg, transparent, ${agent.color}, transparent)` }}
                    />
                  </div>

                  <div className="flex flex-1 flex-col p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{agent.name}</p>
                        <p className="truncate text-[10px] text-fg-mute">{agent.role}</p>
                      </div>
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8.5px] uppercase"
                        style={{ color: agent.color, background: `${agent.color}18` }}
                      >
                        {agent.task}
                      </span>
                    </div>

                    <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-relaxed text-fg-soft">{agent.tagline}</p>

                    <ul className="mt-2 space-y-0.5">
                      {agent.tasks.slice(0, 2).map((task) => (
                        <li key={task.id} className="flex items-start gap-1 text-[9.5px] text-fg-mute">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: agent.color }} />
                          {task.label}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={`/premium?agent=${agent.id}`}
                      className="btn btn-sm mt-2.5 w-full border-line/60 text-[10.5px]"
                    >
                      Confier le calcul <ArrowRight size={11} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {/* ------------------------------------------------------ explication */}
      <section className="panel mt-8 grid gap-3 p-4 sm:grid-cols-3">
        {[
          {
            title: 'Le solveur d’abord',
            body: 'Chaque agent lit U_th, Z_th et I_N produits par l’analyse nodale modifiée. Aucune valeur n’est inventée par le modèle de langage.',
          },
          {
            title: 'Deux voies de sortie',
            body: 'Sans clé : le raisonnement symbolique local rédige la réponse. Avec OpenRouter, Gemini ou OpenAI : le modèle enrichit l’explication.',
          },
          {
            title: 'Vérification croisée',
            body: 'Une proposition n’est acceptée que si le solveur retrouve les mêmes grandeurs à 8 % près (U_th et I_N en DC, Z_th en AC).',
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-line/40 bg-ink-950/50 p-3">
            <p className="text-[12px] font-medium text-fg-soft">{item.title}</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">{item.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
