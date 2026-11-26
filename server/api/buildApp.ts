import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { registerAiRoutes } from './routes/ai';
import { registerAuthRoutes } from './routes/auth';
import { registerCircuitRoutes } from './routes/circuits';
import { registerMiscRoutes } from './routes/misc';
import { registerProfileRoutes } from './routes/profile';
import { registerProjectRoutes } from './routes/projects';
import { registerRealtimeRoutes } from './routes/realtime';
import { registerRoomRoutes } from './routes/rooms';
import { registerSolveRoutes } from './routes/solve';
import { registerTemplateRoutes } from './routes/templates';

/**
 * Construction de l'API Northev Spark.
 *
 * Deux hôtes possibles pour exactement les mêmes routes :
 *   - serveur Node autonome (`npm run api`) : REST + SSE + WebSocket ;
 *   - fonction Vercel (`app/api/[...path]`) : REST via `app.inject()`, sans
 *     écoute de port ; le SSE y est servi par un flux Next dédié.
 *
 * Le mode `embedded` laisse donc de côté le WebSocket (l'atelier Angular a son
 * propre hôte) et le flux SSE (repris par Next) : tout le reste est identique.
 */
export interface BuildOptions {
  /** enregistre SSE + WebSocket (serveur autonome uniquement) */
  realtime?: boolean;
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // curl, serveur à serveur
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host.endsWith('.e2b.app') || host.endsWith('.e2b.dev')) return true;
    if (host.endsWith('.vercel.app')) return true;
    const configured = process.env.FRONTEND_URL;
    if (configured && origin === configured) return true;
    if (process.env.VERCEL_URL && host === process.env.VERCEL_URL) return true;
    return false;
  } catch {
    return false;
  }
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const { realtime = true } = options;
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'production',
    bodyLimit: 8 * 1024 * 1024, // les documents de montage peuvent être volumineux
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  if (realtime) {
    const websocket = (await import('@fastify/websocket')).default;
    await app.register(websocket);
  }

  // Corps JSON : vide → {}, invalide → erreur (normalisée plus bas).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new Error('invalid-json'), undefined);
    }
  });

  // Erreurs normalisées au format { error } attendu par les frontends.
  app.setErrorHandler(
    (error: Error & { statusCode?: number; code?: string }, _request: FastifyRequest, reply: FastifyReply) => {
      if (error.message === 'invalid-json') {
        return reply.code(400).send({ error: 'Requête invalide.' });
      }
      const status = error.statusCode ?? 500;
      if (status === 404) {
        return reply.code(404).send({ error: 'Route introuvable.' });
      }
      if (status >= 500) {
        app.log.error(error);
        return reply.code(500).send({ error: 'Erreur serveur.' });
      }
      return reply.code(status).send({ error: error.message || 'Erreur.' });
    },
  );

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'Route introuvable.' });
  });

  await registerAuthRoutes(app);
  await registerCircuitRoutes(app);
  await registerSolveRoutes(app);
  await registerAiRoutes(app);
  await registerTemplateRoutes(app);
  await registerProfileRoutes(app);
  await registerProjectRoutes(app);
  // Les routes de salle (création, présence, chat, curseurs) existent partout ;
  // seul le flux SSE est réservé au serveur autonome.
  await registerRoomRoutes(app, { sse: realtime });
  if (realtime) await registerRealtimeRoutes(app);
  await registerMiscRoutes(app);

  return app;
}
