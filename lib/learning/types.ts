/**
 * Types de l'Académie Northev Spark.
 *
 * L'académie transforme le studio en parcours : des modules, des leçons
 * jouables, des quiz notés, des défis quotidiens, des badges et des niveaux.
 * Tout est typé ici pour être partagé entre le serveur (Next), les routes API
 * et les composants React.
 */

export type Tier = 'bronze' | 'argent' | 'or' | 'platine';

export type BadgeIcon =
  | 'bolt'
  | 'flame'
  | 'trophy'
  | 'graduation'
  | 'compass'
  | 'atom'
  | 'wave'
  | 'gauge'
  | 'shield'
  | 'crown'
  | 'sparkles'
  | 'target';

export type BadgeCriteria =
  | { kind: 'lessons'; count: number }
  | { kind: 'quiz'; minScore: number; count: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'streak'; days: number }
  | { kind: 'templates'; slugs: string[] }
  | { kind: 'daily'; count: number }
  | { kind: 'perfect' }
  /** leçon terminée entre 0 h et 5 h du matin */
  | { kind: 'night' };

export interface Badge {
  id: string;
  title: string;
  description: string;
  tier: Tier;
  icon: BadgeIcon;
  criteria: BadgeCriteria;
  /** indice affiché quand le badge n'est pas encore obtenu */
  hint: string;
}

export interface Level {
  index: number;
  title: string;
  minXp: number;
  color: string;
  blurb: string;
}

export interface GlossaryEntry {
  term: string;
  short: string;
  long: string;
  tags: string[];
  related: string[];
  formula?: string;
  unit?: string;
}

export interface FormulaEntry {
  id: string;
  title: string;
  expression: string;
  description: string;
  variables: Array<{ symbol: string; meaning: string; unit?: string }>;
  example: string;
  category: 'continu' | 'alternatif' | 'réseaux' | 'puissance' | 'transitoire' | 'filtres';
}

export interface QuizQuestion {
  id: string;
  module: string;
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
}

export interface LessonStep {
  id: string;
  title: string;
  body: string;
  /** gabarit ouvert en un clic depuis la leçon */
  template?: string;
  /** question de contrôle intégrée à l'étape */
  check?: { prompt: string; choices: string[]; answer: number; explanation: string };
  tip?: string;
}

export interface Lesson {
  slug: string;
  title: string;
  minutes: number;
  goal: string;
  steps: LessonStep[];
  xp: number;
  quizModule: string;
}

export interface Module {
  slug: string;
  title: string;
  subtitle: string;
  level: 'découverte' | 'consolidation' | 'maîtrise';
  accent: 'cyan' | 'violet' | 'amber' | 'green' | 'pink';
  icon: string;
  lessons: Lesson[];
}

export interface Challenge {
  id: string;
  date: string;
  title: string;
  brief: string;
  template: string;
  target: { label: string; value: number; unit: string; tolerance: number };
  reward: number;
  difficulty: 1 | 2 | 3;
}

export interface LessonProgress {
  done: boolean;
  at: string;
  xp: number;
}

export interface QuizProgress {
  best: number;
  attempts: number;
  at: string;
}

export interface ChallengeProgress {
  solvedAt: string;
  score: number;
}

export interface UserProgress {
  xp: number;
  days: string[];
  streak: number;
  bestStreak: number;
  lastActive: string | null;
  lessons: Record<string, LessonProgress>;
  quizzes: Record<string, QuizProgress>;
  badges: Record<string, string>;
  challenges: Record<string, ChallengeProgress>;
}

export const EMPTY_PROGRESS: UserProgress = {
  xp: 0,
  days: [],
  streak: 0,
  bestStreak: 0,
  lastActive: null,
  lessons: {},
  quizzes: {},
  badges: {},
  challenges: {},
};
