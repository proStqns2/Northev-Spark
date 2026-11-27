import type { Level } from './types';

/**
 * Progression : XP, niveaux, séries de jours et maîtrise.
 *
 * Les règles sont volontairement lisibles et déterministes : le serveur et le
 * navigateur calculent exactement la même chose, ce qui évite les écarts
 * d'affichage entre l'aperçu optimiste et la valeur enregistrée.
 */

export const LEVELS: Level[] = [
  { index: 1, title: 'Novice du fil', minXp: 0, color: '#7fa6c9', blurb: 'Vous branchez sans court-circuit. C’est déjà beaucoup.' },
  { index: 2, title: 'Lecteur de schéma', minXp: 120, color: '#5ac8fa', blurb: 'Vous repérez les mailles et les nœuds d’un plan.' },
  { index: 3, title: 'Apprenti Thévenin', minXp: 320, color: '#38e1e6', blurb: 'Le diviseur de tension n’a plus de secret.' },
  { index: 4, title: 'Dompteur de Norton', minXp: 640, color: '#46e6a0', blurb: 'Vous passez d’un modèle à l’autre sans effort.' },
  { index: 5, title: 'Analyste nodal', minXp: 1100, color: '#a479ff', blurb: 'Une matrice, trois inconnues, aucune hésitation.' },
  { index: 6, title: 'Architecte de ponts', minXp: 1700, color: '#ffc266', blurb: 'Wheatstone, Millman : vous jugez équilibre et compensation.' },
  { index: 7, title: 'Harmonicien', minXp: 2500, color: '#ff9f68', blurb: 'Impédances complexes, phase, résonance : tout devient clair.' },
  { index: 8, title: 'Ingénieur transitoire', minXp: 3500, color: '#ff7d6b', blurb: 'Constante de temps, régime établi, vous lisez l’oscillogramme.' },
  { index: 9, title: 'Maître du filtrage', minXp: 4800, color: '#ff79c6', blurb: 'Passe-bas, passe-bande : la coupure n’est qu’un chiffre.' },
  { index: 10, title: 'Légende du montage', minXp: 6500, color: '#f7f7ff', blurb: 'Vous corrigez les exercices plus vite que les élèves ne les posent.' },
];

/** XP par action. Un barème unique, appliqué côté serveur. */
export const XP = {
  lesson: 40,
  lessonBonusNoHint: 10,
  quizCorrect: 8,
  quizPerfect: 30,
  quizCompleted: 15,
  challenge: 60,
  dailyVisit: 15,
  export: 10,
  roomCreated: 20,
  drillCorrect: 25,
  drillEffort: 4,
} as const;

export function levelOf(xp: number): Level {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (xp >= level.minXp) current = level;
    else break;
  }
  return current;
}

export function nextLevel(xp: number): Level | null {
  for (const level of LEVELS) {
    if (xp < level.minXp) return level;
  }
  return null;
}

export function levelProgress(xp: number): { level: Level; next: Level | null; ratio: number; missing: number } {
  const level = levelOf(xp);
  const next = nextLevel(xp);
  if (!next) return { level, next: null, ratio: 1, missing: 0 };
  const span = next.minXp - level.minXp;
  const ratio = span <= 0 ? 1 : Math.min(1, Math.max(0, (xp - level.minXp) / span));
  return { level, next, ratio, missing: Math.max(0, next.minXp - xp) };
}

export function todayIso(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function dayBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Met à jour la série de jours actifs.
 * - même jour : rien ne change ;
 * - hier : la série s’allonge ;
 * - plus ancien : la série repart à 1 (nouvelle dynamique).
 */
export function bumpStreak(days: string[], today = todayIso()): { days: string[]; streak: number; bestStreak: number; gained: boolean } {
  const set = new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  const gained = !set.has(today);
  if (gained) set.add(today);
  const sorted = [...set].sort();
  let streak = 0;
  let cursor = sorted.length ? sorted[sorted.length - 1] : today;
  if (set.has(today)) {
    streak = 1;
    let probe = dayBefore(today);
    while (set.has(probe)) {
      streak += 1;
      probe = dayBefore(probe);
    }
  } else if (sorted.length) {
    streak = 0;
    cursor = sorted[sorted.length - 1];
  }

  let best = streak;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous && dayBefore(day) === previous ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return { days: sorted.slice(-400), streak, bestStreak: Math.max(best, streak), gained };
}

/** Maîtrise par domaine, de 0 à 1 — sert au radar de progression. */
export function masteryOf(progress: {
  lessons: Record<string, { done: boolean }>;
  quizzes: Record<string, { best: number }>;
  challenges: Record<string, unknown>;
}, moduleLessons: Record<string, string[]>, moduleQuizzes: Record<string, string[]>): Array<{ module: string; ratio: number }> {
  return Object.keys(moduleLessons).map((module) => {
    const lessons = moduleLessons[module];
    const quizzes = moduleQuizzes[module] ?? [];
    const lessonScore = lessons.length
      ? lessons.filter((slug) => progress.lessons[slug]?.done).length / lessons.length
      : 0;
    const quizScore = quizzes.length
      ? quizzes.reduce((sum, id) => sum + Math.min(1, (progress.quizzes[id]?.best ?? 0) / 100), 0) / quizzes.length
      : 0;
    const ratio = Math.round((lessonScore * 0.6 + quizScore * 0.4) * 100) / 100;
    return { module, ratio };
  });
}

/** Score d’un quiz en pourcentage, arrondi à l’entier. */
export function scorePercent(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

export function gradeOf(percent: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (percent >= 90) return { label: 'Excellent', tone: 'good' };
  if (percent >= 75) return { label: 'Solide', tone: 'good' };
  if (percent >= 60) return { label: 'Acquis', tone: 'warn' };
  return { label: 'À revoir', tone: 'bad' };
}
