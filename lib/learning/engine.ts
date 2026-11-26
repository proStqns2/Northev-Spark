import { BADGES } from './badges';
import { bumpStreak, todayIso, XP, scorePercent } from './xp';
import type { UserProgress } from './types';
import { EMPTY_PROGRESS } from './types';

/**
 * Moteur de progression.
 *
 * Toutes les règles d’XP, de série et de badges vivent ici : le serveur les
 * applique avant d’enregistrer, ce qui rend la progression infalsifiable
 * depuis le navigateur (le client n’envoie qu’un événement, jamais un total).
 */

export interface ProgressContext {
  /** gabarits déjà ouverts par l’élève */
  templates: string[];
}

export interface ProgressEvent {
  kind: 'lesson' | 'quiz' | 'challenge' | 'visit' | 'export' | 'template' | 'room';
  /** leçon terminée, module du quiz, id du défi… */
  target?: string;
  /** score 0-100 pour un quiz, 0-100 pour un défi */
  score?: number;
  template?: string;
}

export interface ProgressResult {
  progress: UserProgress;
  gainedXp: number;
  newBadges: string[];
  message: string;
}

export function normalizeProgress(input: Partial<UserProgress> | undefined): UserProgress {
  const base: UserProgress = { ...EMPTY_PROGRESS, ...(input ?? {}) };
  return {
    xp: Math.max(0, Math.round(base.xp ?? 0)),
    days: Array.isArray(base.days) ? [...new Set(base.days)].sort() : [],
    streak: base.streak ?? 0,
    bestStreak: base.bestStreak ?? 0,
    lastActive: base.lastActive ?? null,
    lessons: base.lessons ?? {},
    quizzes: base.quizzes ?? {},
    badges: base.badges ?? {},
    challenges: base.challenges ?? {},
  };
}

/** Applique un événement et renvoie la progression mise à jour. */
export function applyEvent(
  previous: UserProgress,
  event: ProgressEvent,
  context: ProgressContext,
  now = new Date(),
): ProgressResult {
  const progress = normalizeProgress(structuredClone(previous));
  const today = todayIso(now);
  let gained = 0;
  let message = '';

  const streak = bumpStreak(progress.days, today);
  progress.days = streak.days;
  progress.streak = streak.streak;
  progress.bestStreak = Math.max(progress.bestStreak, streak.bestStreak);
  progress.lastActive = now.toISOString();
  if (streak.gained) gained += XP.dailyVisit;

  switch (event.kind) {
    case 'lesson': {
      const slug = event.target;
      if (!slug) break;
      if (!progress.lessons[slug]?.done) {
        progress.lessons[slug] = { done: true, at: now.toISOString(), xp: XP.lesson };
        gained += XP.lesson;
        message = 'Leçon terminée';
      } else {
        message = 'Leçon déjà validée';
      }
      break;
    }
    case 'quiz': {
      const module = event.target;
      if (!module) break;
      const percent = Math.max(0, Math.min(100, Math.round(event.score ?? 0)));
      const entry = progress.quizzes[module] ?? { best: 0, attempts: 0, at: now.toISOString() };
      const improved = percent > entry.best;
      progress.quizzes[module] = {
        best: Math.max(entry.best, percent),
        attempts: entry.attempts + 1,
        at: now.toISOString(),
      };
      gained += XP.quizCompleted + Math.round((percent / 100) * 10) * XP.quizCorrect / 2;
      if (percent === 100) gained += XP.quizPerfect;
      message = improved ? `Nouveau record : ${percent} %` : `Score : ${percent} %`;
      break;
    }
    case 'challenge': {
      const id = event.target;
      if (!id) break;
      if (!progress.challenges[id]) {
        progress.challenges[id] = { solvedAt: now.toISOString(), score: event.score ?? 100 };
        gained += XP.challenge;
        message = 'Défi relevé';
      } else {
        message = 'Défi déjà résolu';
      }
      break;
    }
    case 'visit': {
      message = streak.gained ? `Série : ${progress.streak} jour(s)` : 'Déjà compté aujourd’hui';
      break;
    }
    case 'export': {
      gained += XP.export;
      message = 'Export enregistré';
      break;
    }
    case 'room': {
      gained += XP.roomCreated;
      message = 'Atelier créé';
      break;
    }
    case 'template': {
      message = 'Montage découvert';
      break;
    }
  }

  progress.xp += gained;

  const templates = new Set(context.templates);
  if (event.template) templates.add(event.template);
  const newBadges = evaluateBadges(progress, { templates: [...templates] });

  return { progress, gainedXp: gained, newBadges, message };
}

/** Évalue tous les badges et marque ceux qui viennent d’être obtenus. */
export function evaluateBadges(progress: UserProgress, context: ProgressContext): string[] {
  const earned: string[] = [];
  const lessonCount = Object.values(progress.lessons).filter((lesson) => lesson.done).length;
  const quizEntries = Object.values(progress.quizzes);
  const perfectQuizzes = quizEntries.filter((quiz) => quiz.best >= 100).length;
  const templates = new Set(context.templates);

  for (const badge of BADGES) {
    if (progress.badges[badge.id]) continue;
    const criteria = badge.criteria;
    let ok = false;

    switch (criteria.kind) {
      case 'lessons':
        ok = lessonCount >= criteria.count;
        break;
      case 'quiz':
        ok = quizEntries.filter((quiz) => quiz.best >= criteria.minScore).length >= criteria.count;
        break;
      case 'xp':
        ok = progress.xp >= criteria.amount;
        break;
      case 'streak':
        ok = progress.bestStreak >= criteria.days;
        break;
      case 'daily':
        ok = Object.keys(progress.challenges).length >= criteria.count;
        break;
      case 'perfect':
        ok = perfectQuizzes >= 1;
        break;
      case 'templates':
        ok = criteria.slugs.every((slug) => templates.has(slug));
        break;
      case 'night':
        ok = Object.values(progress.lessons).some((lesson) => {
          const hour = new Date(lesson.at).getHours();
          return hour >= 0 && hour < 5;
        });
        break;
    }

    if (ok) {
      progress.badges[badge.id] = new Date().toISOString();
      earned.push(badge.id);
    }
  }

  return earned;
}

/** Résumé lisible pour l’API : jamais de structure interne incomplète. */
export function progressSummary(progress: UserProgress, context: ProgressContext) {
  const lessonCount = Object.values(progress.lessons).filter((lesson) => lesson.done).length;
  const quizEntries = Object.entries(progress.quizzes);
  const average = quizEntries.length
    ? Math.round(quizEntries.reduce((sum, [, quiz]) => sum + quiz.best, 0) / quizEntries.length)
    : 0;
  return {
    xp: progress.xp,
    streak: progress.streak,
    bestStreak: progress.bestStreak,
    days: progress.days.slice(-60),
    lessons: lessonCount,
    quizzes: quizEntries.length,
    average,
    badges: Object.keys(progress.badges),
    challenges: Object.keys(progress.challenges).length,
    templates: context.templates.length,
    lastActive: progress.lastActive,
  };
}

export { scorePercent };
