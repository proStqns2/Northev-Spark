import type { Metadata } from 'next';
import { Sparkles, Zap } from 'lucide-react';
import { AGENTS } from '@/lib/ai/agents';
import { providerStatus } from '@/lib/ai/providers';
import { AgentWorkbench, ProviderChips, type WorkbenchAgent } from './AgentWorkbench';

export const metadata: Metadata = {
  title: 'Agents IA',
  description:
    'Les dix agents de Northev Spark : Thévenin série, Norton parallèle, équivalence T⇄N, Thévenin AC, Norton AC, dipôles équivalents, labo T–N, transformation de sources, hub principal et bobines. Chacun s’exécute sur le serveur, sans clé d’API.',
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
    ids: ['lab', 'hub', 'volt', 'mentor'],
  },
];

export default function AgentsPage() {
  const status = providerStatus();
  const agents: WorkbenchAgent[] = AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    tagline: agent.tagline,
    task: agent.task,
    avatar: agent.avatar,
    color: agent.color,
    template: agent.template,
    tasks: agent.tasks.map((task) => ({ id: task.id, label: task.label, description: task.description })),
  }));

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
          <ProviderChips status={status} />
        </div>

        <p className="mt-2 max-w-3xl text-[11.5px] leading-relaxed text-fg-mute">
          Chaque tuile s’exécute côté serveur : Next.js calcule directement, ou délègue au service Express quand il
          tourne. Le badge de la sortie indique qui a répondu.
        </p>
      </header>

      <AgentWorkbench agents={agents} groups={GROUPES} />

      {/* ------------------------------------------------------ explication */}
      <section className="panel mt-8 grid gap-3 p-4 sm:grid-cols-3">
        {[
          {
            title: 'Le solveur d’abord',
            body: 'Chaque agent lit U_th, Z_th et I_N produits par l’analyse nodale modifiée. Aucune valeur n’est inventée par un modèle de langage.',
          },
          {
            title: 'Un runtime, deux serveurs',
            body: 'Les agents vivent dans lib/agents/runtime.ts. Next.js l’exécute directement ; s’il tourne, le service Express le fait à sa place — même résultat, même code.',
          },
          {
            title: 'Sans clé, hors ligne',
            body: 'Aucun agent n’a besoin d’une clé d’API : le calcul est déterministe. Une clé ne sert qu’à enrichir la rédaction de l’explication.',
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
