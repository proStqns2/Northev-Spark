import { z } from 'zod';
import type { ApiRoute } from '../http';
import { bodyOf, currentUser, fail } from '../helpers';
import { userProgress, userTemplates, saveProgress, leaderboard, rankOf, academyStats, recordTemplateVisit } from '@/lib/db/progress';
import { applyEvent, evaluateBadges } from '@/lib/learning/engine';
import { challengeFor, checkChallengeAnswer, recentChallenges } from '@/lib/learning/challenges';
import { BADGES } from '@/lib/learning/badges';
import { MODULES, TOTAL_LESSONS } from '@/lib/learning/curriculum';
import { levelProgress, todayIso } from '@/lib/learning/xp';
import { GLOSSARY, GLOSSARY_TAGS } from '@/lib/learning/glossary';
import { FORMULAS, formulasByCategory } from '@/lib/learning/formulas';
import { QUIZ_BANK } from '@/lib/learning/quiz-bank';
import { cached, jsonWithEtag } from '../cache';
import { pageHeaders, parsePageQuery, queryPage } from '../pagination';
import { metricsSnapshot } from '../metrics';
import { cacheInfo } from '../cache';
import { rateStats } from '../rateLimit';

/**
 * Routes de l’Académie.
 *
 * Le client n’envoie jamais un total d’XP : il envoie un **événement**
 * (« leçon terminée », « quiz à 80 % »). Le serveur recalcule, met à jour les
 * badges et renvoie l’état complet. C’est ce qui rend la progression fiable.
 */

const eventSchema = z.object({
  kind: z.enum(['lesson', 'quiz', 'challenge', 'visit', 'export', 'template', 'room', 'drill']),
  target: z.string().max(80).optional(),
  score: z.number().min(0).max(100).optional(),
  template: z.string().max(64).optional(),
});

const answerSchema = z.object({
  answer: z.number().finite(),
});

export const learningRoutes: ApiRoute[] = [
  [
    'GET',
    '/api/progress',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      const [progress, templates, rank, stats] = await Promise.all([
        userProgress(user.id),
        userTemplates(user.id),
        rankOf(user.id),
        academyStats(),
      ]);
      reply.header('Cache-Control', 'no-store');
      return reply.send({
        progress,
        templates,
        level: levelProgress(progress.xp),
        rank,
        stats,
        catalog: {
          lessons: TOTAL_LESSONS,
          modules: MODULES.map((module) => ({
            slug: module.slug,
            title: module.title,
            lessons: module.lessons.length,
          })),
          badges: BADGES.length,
        },
      });
    },
  ],
  [
    'POST',
    '/api/progress',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      const parsed = eventSchema.safeParse(bodyOf(request));
      if (!parsed.success) {
        return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Événement invalide.');
      }
      const [previous, templates] = await Promise.all([userProgress(user.id), userTemplates(user.id)]);
      const result = applyEvent(previous, parsed.data, { templates });
      const saved = await saveProgress(user.id, result.progress, templates);
      reply.header('Cache-Control', 'no-store');
      return reply.send({
        progress: result.progress,
        gainedXp: result.gainedXp,
        newBadges: result.newBadges.map((id) => BADGES.find((badge) => badge.id === id)).filter(Boolean),
        message: result.message,
        level: levelProgress(result.progress.xp),
        templates: saved.templates,
      });
    },
  ],
  [
    'POST',
    '/api/progress/template',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      const body = bodyOf<{ slug?: string }>(request);
      if (typeof body.slug !== 'string' || !body.slug.trim()) {
        return fail(reply, 422, 'Gabarit manquant.');
      }
      const templates = await recordTemplateVisit(user.id, body.slug.trim().slice(0, 64));
      const progress = await userProgress(user.id);
      const newBadges = evaluateBadges(progress, { templates });
      if (newBadges.length) await saveProgress(user.id, progress, templates);
      return reply.send({
        templates,
        newBadges: newBadges.map((id) => BADGES.find((badge) => badge.id === id)).filter(Boolean),
      });
    },
  ],
  [
    'GET',
    '/api/leaderboard',
    async (_request, reply) => {
      const rows = await leaderboard(25);
      reply.header('Cache-Control', 'no-store');
      return reply.send({ rows });
    },
  ],
  [
    'GET',
    '/api/challenges',
    async (request, reply) => {
      const user = await currentUser(request);
      const today = todayIso();
      const challenge = challengeFor(today);
      const history = recentChallenges(today, 5);
      const progress = user ? await userProgress(user.id) : null;
      reply.header('Cache-Control', 'no-store');
      return reply.send({
        today,
        challenge,
        history,
        solved: progress ? Boolean(progress.challenges[challenge.id]) : false,
        past: progress ? Object.keys(progress.challenges) : [],
      });
    },
  ],
  [
    'POST',
    '/api/challenges',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      const parsed = answerSchema.safeParse(bodyOf(request));
      if (!parsed.success) return fail(reply, 422, 'Réponse invalide.');

      const today = todayIso();
      const challenge = challengeFor(today);
      const verdict = checkChallengeAnswer(challenge, parsed.data.answer);
      if (!verdict.ok) {
        return reply.send({
          ok: false,
          delta: verdict.delta,
          target: challenge.target,
          hint: 'Vérifiez vos conversions (mA/A, kΩ/Ω) et le sens de la chute de tension.',
        });
      }

      const [previous, templates] = await Promise.all([userProgress(user.id), userTemplates(user.id)]);
      const result = applyEvent(previous, { kind: 'challenge', target: challenge.id, score: verdict.score }, { templates });
      await saveProgress(user.id, result.progress, templates);
      return reply.send({
        ok: true,
        score: verdict.score,
        gainedXp: result.gainedXp,
        newBadges: result.newBadges.map((id) => BADGES.find((badge) => badge.id === id)).filter(Boolean),
        level: levelProgress(result.progress.xp),
      });
    },
  ],
  [
    'GET',
    '/api/glossary',
    async (request, reply) => {
      const page = parsePageQuery(request.query, { defaultSize: 24, defaultSort: 'term' });
      const payload = await cached('catalog:glossary', { ttlMs: 60_000, staleMs: 300_000 }, () => ({
        total: GLOSSARY.length,
        tags: GLOSSARY_TAGS,
      }));
      const result = queryPage(GLOSSARY, page, {
        search: (entry) => [entry.term, entry.short, entry.long, entry.formula ?? '', entry.unit ?? '', ...entry.tags],
        sort: (entry, field) => {
          if (field === 'term') return entry.term;
          if (field === 'tags') return entry.tags[0] ?? '';
          return entry.term;
        },
        extraFilter: (entry) => (request.query.tag ? entry.tags.includes(request.query.tag) : true),
      });
      for (const [key, value] of Object.entries(pageHeaders(result))) reply.header(key, value);
      return reply.send({ ...result, catalog: payload });
    },
  ],
  [
    'GET',
    '/api/catalog',
    async (request, reply) => {
      const payload = await cached('catalog:academy', { ttlMs: 120_000, staleMs: 600_000 }, () => ({
        modules: MODULES.map((module) => ({
          slug: module.slug,
          title: module.title,
          summary: module.subtitle,
          level: module.level,
          lessons: module.lessons.length,
        })),
        lessons: TOTAL_LESSONS,
        glossary: GLOSSARY.length,
        formulas: FORMULAS.length,
        questions: QUIZ_BANK.length,
        badges: BADGES.length,
        formulaGroups: formulasByCategory().map((group) => ({ category: group.category, label: group.label, count: group.items.length })),
      }));
      return jsonWithEtag(request.headers, payload, { maxAge: 120, staleWhileRevalidate: 600, headers: { 'X-Catalog': 'academy' } });
    },
  ],
  [
    'GET',
    '/api/metrics',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      reply.header('Cache-Control', 'no-store');
      return reply.send({
        metrics: metricsSnapshot(),
        cache: cacheInfo(),
        limits: rateStats(),
      });
    },
  ],
];
