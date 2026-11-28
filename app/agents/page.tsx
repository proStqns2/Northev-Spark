import type { Metadata } from 'next';
import { Activity, Sparkles, Zap } from 'lucide-react';
import { AGENTS } from '@/lib/ai/agents';
import { providerStatus } from '@/lib/ai/providers';
import { agentTeaser } from '@/lib/agents/runtime';
import { AgentWorkbench, ProviderChips, type WorkbenchAgent } from './AgentWorkbench';

export const metadata: Metadata = {
  title: 'Agents IA',
  description:
    'Les onze agents de Northev Spark : Thévenin série, Norton parallèle, équivalence T⇄N, Thévenin AC, Norton AC, dipôles équivalents, labo T–N, transformation de sources, hub principal, bobines, auditeur et mentor. Chacun s’exécute sur le serveur, sans clé d’API.',
};

export const dynamic = 'force-dynamic';

/**
 * Quatre familles, onze agents — une seule fonction par agent.
 * L'ordre suit le raisonnement de l'élève : modéliser, passer en sinusoïdal,
 * mesurer les sources, puis auditer et comprendre.
 */
const GROUPES: Array<{ title: string; hint: string; ids: string[] }> = [
  {
    title: 'Modèles équivalents',
    hint: 'Série, parallèle et passerelle T ⇄ N.',
    ids: ['theo', 'nora', 'convert', 'dipoles'],
  },
  {
    title: 'Régime sinusoïdal',
    hint: 'Impédances complexes, bobines et résonance.',
    ids: ['impeda', 'coils'],
  },
  {
    title: 'Sources & mesure',
    hint: 'Transformation de sources et banc de mesures.',
    ids: ['sources', 'lab'],
  },
  {
    title: 'Audit & pédagogie',
    hint: 'Verdict de montage, méthode et synthèse.',
    ids: ['volt', 'mentor', 'hub'],
  },
];

export default function AgentsPage() {
  const status = providerStatus();
  /* auto-contrôle : la page prouve à chaque rendu que les onze agents calculent */
  const checks = AGENTS.map((agent) => ({ agent, teaser: agentTeaser(agent.id) }));
  const answered = checks.filter((entry) => entry.teaser.headline.length > 0).length;
  const green = checks.filter((entry) => entry.teaser.ok).length;
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
          Onze agents spécialisés, chacun avec son emblème et sa fonction : quatre construisent le modèle équivalent,
          deux travaillent en sinusoïdal, deux traitent les sources et la mesure, trois audient et expliquent. Tous
          s’appuient sur le même solveur nodal ; le modèle de langage ne fait que rédiger l’explication finale — il ne
          calcule jamais à votre place.
        </p>
        <p className="mt-1.5 max-w-3xl text-[11.5px] leading-relaxed text-fg-mute">
          Chaque bouton de tâche déclenche un calcul différent : superposition, diagnostic, conversion, optimisation,
          vérification, réduction, procès-verbal, méthode, plan ou quiz. Changer de tâche change le résultat, pas
          seulement le titre.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip">
            <Zap size={10} /> {AGENTS.length} agents
          </span>
          <ProviderChips status={status} />
        </div>

        {/* auto-contrôle rendu côté serveur : chaque point est un agent exécuté ici même */}
        <div className="panel mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 p-2">
          <span
            className={`chip ${
              answered === checks.length ? 'border-spark-green/40 text-spark-green' : 'border-spark-amber/40 text-spark-amber'
            }`}
            title={`Test d’exécution effectué à chaque affichage de la page · ${green} verdict(s) positif(s)`}
          >
            <Activity size={10} /> {answered}/{checks.length} agents ont répondu
          </span>
          <ul className="flex flex-wrap items-center gap-1">
            {checks.map(({ agent, teaser }) => (
              <li key={agent.id}>
                <span
                  className="flex items-center gap-1 rounded border border-line/40 px-1.5 py-0.5 text-[9.5px] text-fg-mute"
                  title={`${agent.name} — ${teaser.headline}`}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: teaser.ok ? '#46e6a0' : '#ffc266' }}
                  />
                  {agent.name}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-2 max-w-3xl text-[11.5px] leading-relaxed text-fg-mute">
          Chaque tuile s’exécute côté serveur : Next.js calcule directement, ou délègue au service Express quand il
          tourne. Le badge de la sortie indique qui a répondu.
        </p>
      </header>

      <AgentWorkbench agents={agents} groups={GROUPES} />

      {/* ------------------------------------------------------ explication */}
      <section className="panel mt-8 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Une tâche = un calcul',
            body: 'lib/agents/tasks.ts recalcule pour chaque tâche : superposition source par source, diagnostic topologique, procès-verbal, quiz corrigé. Le bouton ne change plus seulement le libellé.',
          },
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
