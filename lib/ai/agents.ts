/**
 * Agents IA de Northev Spark.
 *
 * Chaque agent correspond à une des dix tuiles du manuel — ce sont les
 * « travailleurs » qui cherchent le schéma équivalent. Cinq agents sont
 * conversationnels (Théo, Nora, Impeda, Volt, Mentor) et cinq sont des
 * spécialistes de calcul (Équivalence T⇄N, Labo T–N, Transformation de
 * sources, Hub principal, Bobines & impédances).
 */

export type AgentId =
  | 'theo'
  | 'nora'
  | 'impeda'
  | 'volt'
  | 'mentor'
  | 'convert'
  | 'lab'
  | 'sources'
  | 'hub'
  | 'coils'
  | 'dipoles';

export interface AgentTask {
  id: string;
  label: string;
  description: string;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  tagline: string;
  description: string;
  /** tuile du manuel (embleme + libellé) */
  avatar: string;
  color: string;
  accentClass: string;
  /** tâche proposée à l'API /api/ai (les agents de calcul utilisent "equivalence") */
  task: string;
  /** agent conversationnel : peut être envoyé à un fournisseur LLM */
  conversational: boolean;
  tasks: AgentTask[];
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'theo',
    name: 'Théo',
    role: 'Analyste Thévenin',
    tagline: 'Extrait le modèle série de tout réseau.',
    description:
      'Théo résout le réseau par analyse nodale modifiée, calcule U_th et Z_th, puis vérifie le résultat par court-circuit. Chaque étape est expliquée comme une correction de copie.',
    avatar: '/agents/tiles/thevenin-serie.png',
    color: '#4f9dff',
    accentClass: 'from-spark-blue/25 to-spark-cyan/10',
    task: 'equivalence',
    conversational: true,
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
    avatar: '/agents/tiles/norton-parallele.png',
    color: '#38e1e6',
    accentClass: 'from-spark-cyan/25 to-spark-green/10',
    task: 'equivalence',
    conversational: true,
    tasks: [
      { id: 'equivalence', label: 'Équivalent Norton', description: 'I_N, R_N et cohérence avec Thévenin.' },
      { id: 'conversion', label: 'Conversion T ⇄ N', description: 'Passe d’un modèle à l’autre sans perte.' },
      { id: 'optimisation', label: 'Optimisation', description: 'Suggère des simplifications du schéma.' },
    ],
  },
  {
    id: 'convert',
    name: 'Équivalence',
    role: 'Passerelle T ⇄ N',
    tagline: 'Les deux modèles sont interchangeables.',
    description:
      'Agent de conversion : il vérifie E_th = R_N · I_N et R_th = R_N, puis produit les deux écritures du même dipôle. Il certifie que l’écart reste sous la tolérance numérique.',
    avatar: '/agents/tiles/equivalence-tn.png',
    color: '#a479ff',
    accentClass: 'from-spark-violet/25 to-spark-pink/10',
    task: 'conversion',
    conversational: true,
    tasks: [
      { id: 'conversion', label: 'Conversion T ⇄ N', description: 'Écriture symbolique et numérique des deux modèles.' },
      { id: 'verification', label: 'Vérifier l’équivalence', description: 'Contrôle U_th = I_N · R_th.' },
    ],
  },
  {
    id: 'impeda',
    name: 'Impéda',
    role: 'Impédances AC',
    tagline: 'Z_th complexe, modules et phases.',
    description:
      'Impéda travaille en régime sinusoïdal : elle compose Z = R + jωL + 1/(jωC), mesure les déphasages et détecte la résonance (f₀, facteur de qualité).',
    avatar: '/agents/tiles/thevenin-ac-serie-rl.png',
    color: '#4f9dff',
    accentClass: 'from-spark-blue/25 to-spark-amber/10',
    task: 'equivalence',
    conversational: true,
    tasks: [
      { id: 'equivalence', label: 'Thévenin AC série RL', description: 'Z_th avec partie imaginaire et phase.' },
      { id: 'reduction', label: 'Réduction symbolique', description: 'Série / parallèle pas à pas.' },
      { id: 'diagnostic', label: 'Résonance', description: 'Fréquence propre et facteur de qualité.' },
    ],
  },
  {
    id: 'coils',
    name: 'Bobines',
    role: 'Bobines & impédances',
    tagline: 'Le régime sinusoïdal de bout en bout.',
    description:
      'Spécialiste AC parallèle : elle convertit un réseau RL/RC en modèle de Norton complexe, en conservant module et phase de chaque branche.',
    avatar: '/agents/tiles/norton-ac-parallele-rl.png',
    color: '#46e6a0',
    accentClass: 'from-spark-green/25 to-spark-cyan/10',
    task: 'equivalence',
    conversational: true,
    tasks: [
      { id: 'equivalence', label: 'Norton AC parallèle RL', description: 'I_N complexe et admittance interne.' },
      { id: 'reduction', label: 'Admittances', description: 'Somme des admittances en parallèle.' },
    ],
  },
  {
    id: 'lab',
    name: 'Labo T–N',
    role: 'Laboratoire de calcul',
    tagline: 'Le banc de mesure virtuel.',
    description:
      'Agent de laboratoire : il pose les deux mesures fondamentales (tension à vide, courant de court-circuit) et en déduit R_th = U_th / I_cc avec l’incertitude de mesure.',
    avatar: '/agents/tiles/labo-calcul-tn.png',
    color: '#ffc266',
    accentClass: 'from-spark-amber/25 to-spark-coral/10',
    task: 'verification',
    conversational: true,
    tasks: [
      { id: 'verification', label: 'Mesures à vide / en court-circuit', description: 'U_th, I_cc, R_th = U_th / I_cc.' },
      { id: 'rapport', label: 'Procès-verbal', description: 'Tableau de mesures prêt pour l’export.' },
    ],
  },
  {
    id: 'sources',
    name: 'Sources',
    role: 'Transformation de sources',
    tagline: 'Éteindre, simplifier, reconstruire.',
    description:
      'Agent de transformation : il applique les équivalences de sources (Thévenin ↔ Norton à l’intérieur du réseau), éteint les sources pour le calcul de R_th et simplifie les branches parallèles.',
    avatar: '/agents/tiles/transformation-sources.png',
    color: '#ff7d6b',
    accentClass: 'from-spark-coral/25 to-spark-amber/10',
    task: 'reduction',
    conversational: true,
    tasks: [
      { id: 'reduction', label: 'Transformation de sources', description: 'Conversion locale puis réduction globale.' },
      { id: 'superposition', label: 'Sources éteintes', description: 'Le réseau passif donne R_th.' },
    ],
  },
  {
    id: 'hub',
    name: 'Hub',
    role: 'Hub principal d’équivalence',
    tagline: 'Le chef d’orchestre des agents.',
    description:
      'Le Hub coordonne les quatre axes du projet : mesure, Thévenin, Norton et conversion. Il agrège les réponses des autres agents et produit la synthèse signée.',
    avatar: '/agents/tiles/hub-principal.png',
    color: '#4f9dff',
    accentClass: 'from-spark-blue/25 to-spark-violet/10',
    task: 'equivalence',
    conversational: true,
    tasks: [
      { id: 'equivalence', label: 'Synthèse complète', description: 'Agrège les vérifications de tous les agents.' },
      { id: 'rapport', label: 'Rapport de validation', description: 'Checklist signée pour l’export.' },
    ],
  },
  {
    id: 'dipoles',
    name: 'Dipôles',
    role: 'Dipôles équivalents',
    tagline: 'Un réseau, un dipôle équivalent.',
    description:
      'Agent de modélisation : il remplace tout réseau linéaire vu de A–B par le dipôle unique qui le reproduit exactement, en vérifiant la courbe U(I).',
    avatar: '/agents/tiles/dipoles-equivalents.png',
    color: '#ffc266',
    accentClass: 'from-spark-amber/25 to-spark-cyan/10',
    task: 'pedagogie',
    conversational: true,
    tasks: [
      { id: 'pedagogie', label: 'Expliquer le dipôle équivalent', description: 'Caractéristique U(I) et interprétation.' },
      { id: 'verification', label: 'Caractéristique U(I)', description: 'Deux points de mesure suffisent.' },
    ],
  },
  {
    id: 'volt',
    name: 'Volt',
    role: 'Auditeur de montage',
    tagline: 'Il refuse de valider une erreur.',
    description:
      'Volt contrôle la topologie, la cohérence des bornes et les cas limites. Il rédige le rapport de validation et refuse de certifier un montage mal branché.',
    avatar: '/agents/tiles/transformation-sources.png',
    color: '#46e6a0',
    accentClass: 'from-spark-green/25 to-spark-cyan/10',
    task: 'verification',
    conversational: true,
    tasks: [
      { id: 'verification', label: 'Audit du montage', description: 'Topologie, cohérence, cas limites.' },
      { id: 'rapport', label: 'Rapport de validation', description: 'Checklist signée pour l’export.' },
    ],
  },
  {
    id: 'mentor',
    name: 'Mentor',
    role: 'Pédagogie',
    tagline: 'La méthode avant la réponse.',
    description:
      'Mentor enseigne la méthode : quelles lois appliquer, dans quel ordre, et pourquoi l’équivalent obtenu a du sens physiquement. Il génère aussi des quiz de vérification.',
    avatar: '/agents/tiles/hub-principal.png',
    color: '#a479ff',
    accentClass: 'from-spark-violet/25 to-spark-cyan/10',
    task: 'pedagogie',
    conversational: true,
    tasks: [
      { id: 'pedagogie', label: 'Expliquer la méthode', description: 'Pas à pas, niveau lycée / prépa.' },
      { id: 'plan', label: 'Plan de résolution', description: 'Quelle loi utiliser, dans quel ordre.' },
      { id: 'quiz', label: 'Générer un quiz', description: '3 questions corrigées sur le montage.' },
    ],
  },
];

export const agentById = (id: string): AgentDefinition | undefined => AGENTS.find((a) => a.id === id);

/** identifiants acceptés par les routes IA (rétro-compatibles) */
export const CONVERSATIONAL_IDS = AGENTS.filter((a) => a.conversational).map((a) => a.id);
