import { snapshot, transaction } from './store';
import type { ProgressRecord } from './store';
import { normalizeProgress } from '@/lib/learning/engine';
import type { UserProgress } from '@/lib/learning/types';

/**
 * Persistance de la progression académique.
 *
 * Une ligne par utilisateur, stockée avec le reste de la base JSON et
 * relue par les pages serveur (progression, badges, classement). Les écritures
 * passent par `transaction()` : deux événements simultanés ne peuvent pas
 * écraser un total d’XP.
 */

export function toUserProgress(record: ProgressRecord | undefined): UserProgress {
  if (!record) return normalizeProgress(undefined);
  return normalizeProgress({
    xp: record.xp,
    days: record.days,
    streak: record.streak,
    bestStreak: record.bestStreak,
    lastActive: record.lastActive,
    lessons: record.lessons,
    quizzes: record.quizzes,
    badges: record.badges,
    challenges: record.challenges,
  });
}

export async function progressRecord(userId: string): Promise<ProgressRecord | undefined> {
  return snapshot((db) => db.progress.find((row) => row.userId === userId));
}

export async function userProgress(userId: string): Promise<UserProgress> {
  return toUserProgress(await progressRecord(userId));
}

export async function userTemplates(userId: string): Promise<string[]> {
  const record = await progressRecord(userId);
  return record?.templates ?? [];
}

/** Enregistre la progression complète (déjà calculée par le moteur). */
export async function saveProgress(
  userId: string,
  progress: UserProgress,
  templates: string[],
): Promise<ProgressRecord> {
  const record = await transaction((db) => {
    let row = db.progress.find((item) => item.userId === userId);
    if (!row) {
      row = {
        userId,
        xp: 0,
        days: [],
        streak: 0,
        bestStreak: 0,
        lastActive: null,
        lessons: {},
        quizzes: {},
        badges: {},
        challenges: {},
        templates: [],
        updatedAt: new Date().toISOString(),
      };
      db.progress.push(row);
    }
    row.xp = progress.xp;
    row.days = progress.days;
    row.streak = progress.streak;
    row.bestStreak = progress.bestStreak;
    row.lastActive = progress.lastActive;
    row.lessons = progress.lessons;
    row.quizzes = progress.quizzes;
    row.badges = progress.badges;
    row.challenges = progress.challenges;
    row.templates = [...new Set([...row.templates, ...templates])].slice(-200);
    row.updatedAt = new Date().toISOString();
    return row;
  });
  return record;
}

/** Ajoute un gabarit visité sans toucher au reste de la progression. */
export async function recordTemplateVisit(userId: string, slug: string): Promise<string[]> {
  return transaction((db) => {
    let row = db.progress.find((item) => item.userId === userId);
    if (!row) {
      row = {
        userId,
        xp: 0,
        days: [],
        streak: 0,
        bestStreak: 0,
        lastActive: null,
        lessons: {},
        quizzes: {},
        badges: {},
        challenges: {},
        templates: [],
        updatedAt: new Date().toISOString(),
      };
      db.progress.push(row);
    }
    if (!row.templates.includes(slug)) {
      row.templates.push(slug);
      row.xp += 5;
    }
    row.updatedAt = new Date().toISOString();
    return row.templates;
  });
}

export interface LeaderboardRow {
  userId: string;
  name: string;
  avatar: string;
  xp: number;
  streak: number;
  lessons: number;
  quizzes: number;
  badges: number;
}

/** Classement global, joint avec les comptes pour afficher nom et avatar. */
export async function leaderboard(limit = 25): Promise<LeaderboardRow[]> {
  const rows = await snapshot((db) => {
    return db.progress
      .map((row) => {
        const user = db.users.find((candidate) => candidate.id === row.userId);
        if (!user) return null;
        return {
          userId: row.userId,
          name: user.name,
          avatar: user.avatar,
          xp: row.xp,
          streak: row.streak,
          lessons: Object.values(row.lessons).filter((lesson) => lesson.done).length,
          quizzes: Object.keys(row.quizzes).length,
          badges: Object.keys(row.badges).length,
        } satisfies LeaderboardRow;
      })
      .filter((row): row is LeaderboardRow => row !== null);
  });

  return rows.sort((a, b) => b.xp - a.xp || b.badges - a.badges || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Position de l’utilisateur dans le classement (1 = premier). */
export async function rankOf(userId: string): Promise<{ rank: number; total: number }> {
  const rows = await leaderboard(500);
  const index = rows.findIndex((row) => row.userId === userId);
  return { rank: index === -1 ? rows.length + 1 : index + 1, total: rows.length };
}

/** Statistiques globales de l’académie, pour la page d’accueil et /api/metrics. */
export async function academyStats(): Promise<{
  learners: number;
  lessonsDone: number;
  quizzesTaken: number;
  badgesEarned: number;
  xpTotal: number;
}> {
  return snapshot((db) => ({
    learners: db.progress.length,
    lessonsDone: db.progress.reduce(
      (sum, row) => sum + Object.values(row.lessons).filter((lesson) => lesson.done).length,
      0,
    ),
    quizzesTaken: db.progress.reduce((sum, row) => sum + Object.keys(row.quizzes).length, 0),
    badgesEarned: db.progress.reduce((sum, row) => sum + Object.keys(row.badges).length, 0),
    xpTotal: db.progress.reduce((sum, row) => sum + row.xp, 0),
  }));
}
