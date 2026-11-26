export type AgentId = 'theo' | 'nora' | 'impeda' | 'volt' | 'mentor';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  tagline: string;
  description: string;
  avatar: string;
  color: string;
  accentClass: string;
  tasks: Array<{ id: string; label: string; description: string }>;
  model: 'openai' | 'gemini' | 'local';
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'theo',
    name: 'Théo',
    role: 'Analyste Thévenin',
    tagline: 'Extrait le modèle série de tout réseau.',
    description:
      'Théo résout le réseau par analyse nodale modifiée, calcule U_th et Z_th, puis vérifie le résultat par court-circuit. Il explique chaque étape comme une correction de copie.',
    avatar: '/agents/theo.png',
    color: '#38e1e6',
    accentClass: 'from-spark-cyan/25 to-spark-blue/10',
    model: 'openai',
    tasks: [
      { id: 'equivalence', label: 'Équivalent Thévenin', description: 'Calcul complet + vérification croisée.' },
      { id: 'superposition', label: 'Superposition', description: 'Contribution de chaque source.' },
      { id: 'diagnostic', label: 'Diagnostic du réseau', description: 'Nœuds flottants, boucles, sources court-circuitées.' },
    ],
  },
  {
    id: 'nora',
    name: 'Nora',
    role: 'Experte Norton',
    tagline: 'La forme parallèle, sans approximation.',
    description:
      'Nora transforme le réseau en modèle de Norton, vérifie U_th = I_N · R_N et signale les cas limites (source idéale en parallèle, bornes court-circuitées).',
    avatar: '/agents/nora.png',
    color: '#a479ff',
    accentClass: 'from-spark-violet/25 to-spark-pink/10',
    model: 'gemini',
    tasks: [
      { id: 'equivalence', label: 'Équivalent Norton', description: 'I_N, R_N et cohérence avec Thévenin.' },
      { id: 'conversion', label: 'Conversion T ⇄ N', description: 'Passe d’un modèle à l’autre sans perte.' },
      { id: 'optimisation', label: 'Optimisation', description: 'Suggère des simplifications du schéma.' },
    ],
  },
  {
    id: 'impeda',
    name: 'Impeda',
    role: 'Impédances complexes',
    tagline: 'Régime sinusoïdal, phaseurs, résonance.',
    description:
      'Impeda travaille en AC : Z = R + jLω + 1/(jCω), calcule les modules et phases, et repère la fréquence de résonance du montage.',
    avatar: '/agents/impeda.png',
    color: '#ffc266',
    accentClass: 'from-spark-amber/25 to-spark-coral/10',
    model: 'gemini',
    tasks: [
      { id: 'equivalence', label: 'Thévenin complexe', description: 'Z_th réel + imaginaire, phase et module.' },
      { id: 'reduction', label: 'Réduction symbolique', description: 'Série/parallèle pas à pas.' },
      { id: 'diagnostic', label: 'Vérifier la résonance', description: 'Fréquence propre et facteur de qualité.' },
    ],
  },
  {
    id: 'volt',
    name: 'Volt',
    role: 'Contrôleur de conformité',
    tagline: 'Vérifie deux fois, publie une fois.',
    description:
      'Volt ne calcule pas : il vérifie. Il relit les résultats du solveur, mesure l’écart de vérification croisée et valide la topologie avant publication.',
    avatar: '/agents/volt.png',
    color: '#46e6a0',
    accentClass: 'from-spark-green/25 to-spark-cyan/10',
    model: 'openai',
    tasks: [
      { id: 'verification', label: 'Audit du montage', description: 'Topologie, cohérence, cas limites.' },
      { id: 'rapport', label: 'Rapport de validation', description: 'Checklist signée pour l’export.' },
      { id: 'diagnostic', label: 'Détecter les erreurs', description: 'Fils isolés, masses manquantes, sources idéales.' },
    ],
  },
  {
    id: 'mentor',
    name: 'Mentor',
    role: 'Pédagogie & méthode',
    tagline: 'La méthode avant la réponse.',
    description:
      'Mentor ne donne pas directement le résultat : il pose la démarche, propose un exercice guidé et génère un quiz à partir du montage courant.',
    avatar: '/agents/mentor.png',
    color: '#4f9dff',
    accentClass: 'from-spark-blue/25 to-spark-violet/10',
    model: 'openai',
    tasks: [
      { id: 'pedagogie', label: 'Expliquer la méthode', description: 'Pas à pas, niveau lycée / prépa.' },
      { id: 'plan', label: 'Plan de résolution', description: 'Quelle loi utiliser, dans quel ordre.' },
      { id: 'quiz', label: 'Générer un quiz', description: '3 questions corrigées sur le montage.' },
    ],
  },
];

export const agentById = (id: string): AgentDefinition | undefined =>
  AGENTS.find((a) => a.id === id);
