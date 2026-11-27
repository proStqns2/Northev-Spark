import {
  Award,
  Beaker,
  BookOpen,
  CircuitBoard,
  Crown,
  Dumbbell,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Wrench,
} from 'lucide-react';

/**
 * Plan du site — source unique.
 *
 * La barre de navigation et le pied de page lisent la même structure : une
 * page ajoutée ici est immédiatement atteignable des deux endroits, et une
 * page supprimée ne laisse pas de lien mort. C'était l'un des reproches :
 * « il y a beaucoup de boutons en haut et des pages que je ne peux pas
 * ouvrir » — les entrées étaient éparpillées dans deux listes distinctes.
 */

export interface SiteLink {
  href: string;
  label: string;
  icon: typeof BookOpen;
  hint: string;
  badge?: string;
}

export interface SiteGroup {
  id: string;
  label: string;
  icon: typeof BookOpen;
  items: SiteLink[];
}

/** accès directs, toujours visibles sur grand écran */
export const PRIMARY: SiteLink[] = [
  { href: '/studio', label: 'Studio', icon: CircuitBoard, hint: 'Dessiner, calculer, vérifier' },
  { href: '/academie', label: 'Académie', icon: GraduationCap, hint: 'Le parcours complet' },
  { href: '/projets', label: 'Projets', icon: FolderKanban, hint: 'Vos montages enregistrés' },
  { href: '/multiwork', label: 'Multiwork', icon: Users, hint: 'Travailler à plusieurs' },
];

/** menus thématiques, regroupés par intention */
export const GROUPS: SiteGroup[] = [
  {
    id: 'apprendre',
    label: 'Apprendre',
    icon: BookOpen,
    items: [
      { href: '/bibliotheque', label: 'Bibliothèque', icon: BookOpen, hint: 'Cours, fiches et méthodes' },
      { href: '/symboles', label: 'Symboles', icon: Shapes, hint: 'Les dipôles et leur contrat 2D' },
      { href: '/formules', label: 'Formules', icon: ListChecks, hint: 'Thévenin, Norton, diviseurs' },
      { href: '/glossaire', label: 'Glossaire', icon: Sparkles, hint: 'Le vocabulaire de l’électronicien' },
    ],
  },
  {
    id: 'entrainer',
    label: 'S’entraîner',
    icon: Dumbbell,
    items: [
      { href: '/exercices', label: 'Exercices', icon: Dumbbell, hint: 'Guidés, corrigés pas à pas' },
      { href: '/quiz', label: 'Quiz', icon: ListChecks, hint: 'Vérifier un point précis' },
      { href: '/defis', label: 'Défis', icon: Target, hint: 'Un objectif, un schéma à trouver' },
      { href: '/progression', label: 'Progression', icon: TrendingUp, hint: 'Vos résultats dans le temps' },
      { href: '/classement', label: 'Classement', icon: Trophy, hint: 'Comparer avec les autres' },
      { href: '/badges', label: 'Badges', icon: Award, hint: 'Les jalons déjà franchis' },
    ],
  },
  {
    id: 'outils',
    label: 'Outils',
    icon: Wrench,
    items: [
      { href: '/agents', label: 'Agents', icon: Sparkles, hint: 'Théo, Nora, Impéda, Volt…' },
      { href: '/labo', label: 'Labo', icon: Beaker, hint: 'Mesures et expériences' },
      { href: '/export', label: 'Export', icon: FlaskConical, hint: 'Rapport, SPICE, JSON' },
      { href: '/express', label: 'Service R·C·L', icon: SlidersHorizontal, hint: 'API de calcul', badge: 'API' },
      { href: '/assistant', label: 'Assistant IA', icon: Wrench, hint: 'Réglages de l’IA (opt-in)' },
      { href: '/premium', label: 'Premium', icon: Crown, hint: 'Les agents avancés', badge: 'IA' },
    ],
  },
];

/** toutes les entrées, à plat (pied de page, tests de liens) */
export const ALL_LINKS: SiteLink[] = [...PRIMARY, ...GROUPS.flatMap((group) => group.items)];

/** pages hors navigation principale mais publiques */
export const FOOTER_EXTRA: SiteLink[] = [
  { href: '/compte', label: 'Mon compte', icon: Users, hint: 'Connexion et historique' },
  { href: '/', label: 'Accueil', icon: CircuitBoard, hint: 'Présentation du site' },
];
