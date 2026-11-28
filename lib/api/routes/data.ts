import type { ApiRoute } from '../http';

import { backupToMongo, mongoStatus, readCollection } from '@/lib/db/mongo';
import { snapshot } from '@/lib/db/store';
import { currentUser, fail } from '../helpers';

/**
 * Routes d'exploitation des données.
 *
 *  - `/api/data/status`   : état du stockage local et du miroir MongoDB ;
 *  - `/api/data/backup`   : copie complète vers MongoDB (action explicite) ;
 *  - `/api/analytics/export` : flux JSONL destiné au pipeline PySpark.
 *
 * Aucune de ces routes n'est appelée au chargement des pages : l'application
 * fonctionne intégralement sans elles.
 */

function isOperator(user: { id: string } | null, headers: Record<string, string | undefined>): boolean {
  const token = process.env.DATA_ADMIN_TOKEN;
  if (token && headers['x-data-token'] === token) return true;
  // faute d'annuaire de rôles complet, l'opérateur est désigné par variable
  // d'environnement ; sinon tout compte connecté peut sauvegarder une copie.
  if (!token) return Boolean(user);
  return Boolean(user) && process.env.DATA_ADMIN_USER_ID === user?.id;
}

export const dataRoutes: ApiRoute[] = [
  [
    'GET',
    '/api/data/status',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      const counts = await snapshot((db) => ({
        users: db.users.length,
        sessions: db.sessions.length,
        circuits: db.circuits.length,
        projects: db.projects.length,
        rooms: db.rooms.length,
        progress: db.progress.length,
        schema: db.meta.schema,
      }));
      const mongo = await mongoStatus();
      reply.header('Cache-Control', 'no-store');
      return reply.send({
        local: { driver: 'json', path: '.data/db.json', counts },
        mongo,
        mirror: mongo.mirror,
        note: mongo.configured
          ? 'MongoDB est configuré : sauvegarde manuelle depuis /api/data/backup.'
          : 'MongoDB non configuré — le stockage JSON local reste la source de vérité.',
      });
    },
  ],

  [
    'POST',
    '/api/data/backup',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      if (!isOperator(user, request.headers)) return fail(reply, 403, 'Sauvegarde réservée à l’opérateur.');
      const report = await backupToMongo();
      reply.header('Cache-Control', 'no-store');
      const status = await mongoStatus();
      return reply.code(report.ok ? 200 : 503).send({ report, mongo: status });
    },
  ],

  [
    'GET',
    '/api/data/collections/:name',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      if (!isOperator(user, request.headers)) return fail(reply, 403, 'Lecture réservée à l’opérateur.');
      const name = (request.params as { name: string }).name;
      if (!/^spark_[a-z_]+$/.test(name)) return fail(reply, 422, 'Collection inconnue.');
      const rows = await readCollection(name, Number(request.query.limit ?? 25));
      reply.header('Cache-Control', 'no-store');
      return reply.send({ collection: name, rows, count: rows.length });
    },
  ],

  [
    'GET',
    '/api/analytics/export',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Non authentifié.');
      if (!isOperator(user, request.headers)) return fail(reply, 403, 'Export réservé à l’opérateur.');

      const lines = await snapshot((db) => {
        const rows: string[] = [];
        const pushed = (row: Record<string, unknown>) => rows.push(JSON.stringify(row));

        for (const progress of db.progress) {
          pushed({
            type: 'learner_summary',
            user: opaque(progress.userId),
            xp: progress.xp,
            streak: progress.streak,
            bestStreak: progress.bestStreak,
            lessons: Object.keys(progress.lessons ?? {}).length,
            quizzes: Object.values(progress.quizzes ?? {}).length,
            badges: Object.keys(progress.badges ?? {}).length,
            drills: progress.drills?.solved ?? 0,
            drillsCorrect: progress.drills?.correct ?? 0,
            days: (progress.days ?? []).length,
            lastActive: progress.lastActive,
          });
          for (const [slug, quiz] of Object.entries(progress.quizzes ?? {})) {
            pushed({
              type: 'quiz_attempt',
              user: opaque(progress.userId),
              module: slug,
              best: quiz.best,
              attempts: quiz.attempts,
              at: quiz.at,
            });
          }
          for (const [slug, lesson] of Object.entries(progress.lessons ?? {})) {
            pushed({ type: 'lesson_done', user: opaque(progress.userId), lesson: slug, at: lesson.at, xp: lesson.xp });
          }
          for (const [kind, tally] of Object.entries(progress.drills?.byKind ?? {})) {
            pushed({
              type: 'drill_stats',
              user: opaque(progress.userId),
              kind,
              solved: tally.solved,
              correct: tally.correct,
            });
          }
          for (const [id, solvedAt] of Object.entries(progress.badges ?? {})) {
            pushed({ type: 'badge', user: opaque(progress.userId), badge: id, at: solvedAt });
          }
        }

        for (const circuit of db.circuits) {
          const doc = (circuit.doc ?? {}) as { components?: unknown[]; regime?: string };
          pushed({
            type: 'circuit',
            owner: opaque(circuit.ownerId),
            components: doc.components?.length ?? 0,
            regime: doc.regime ?? 'dc',
            template: circuit.templateSlug ?? null,
            status: circuit.status,
            createdAt: circuit.createdAt,
            vth: circuit.lastResult?.vth ?? null,
            rth: circuit.lastResult?.rth ?? null,
          });
        }
        return rows;
      });

      // `reply.send` sérialise en JSON : pour du JSONL, on renvoie un
      // `Response` brut afin que chaque ligne reste un objet indépendant.
      return new Response(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Content-Disposition': 'attachment; filename="spark-events.jsonl"',
          'Cache-Control': 'no-store',
          'X-Event-Count': String(lines.length),
        },
      });
    },
  ],
];

/** Identifiant stable mais non réversible : aucun e-mail dans les exports. */
function opaque(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
  }
  return `anon_${hash.toString(16)}`;
}
