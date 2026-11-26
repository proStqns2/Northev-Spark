/**
 * Northev Spark — backend unifié (Node + Fastify).
 *
 * Un seul serveur Node possède toute l'API :
 *   - REST        : comptes, montages, projets, solveur, IA, gabarits, import
 *   - SSE         : salles de compte (présence, curseurs, révisions, chat)
 *   - WebSocket   : salles invitées de l'atelier Angular (`/rt/ws/:code`)
 *
 * Next.js n'est plus qu'un frontend : il relaie `/api/*` vers ce serveur
 * (voir `rewrites` dans next.config.mjs). Angular s'y connecte via son proxy.
 *
 * Démarrage :  npm run api          (port 4100 par défaut, PORT pour changer)
 *              PORT=5000 npm run api
 */

// Le backend autonome doit charger .env.local lui-même (Next.js ne le fait
// plus pour lui) : SECRET_KEY (coffre), Supabase, clés IA serveur…
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
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

const PORT = Number(process.env.PORT ?? 4100);
const HOST = process.env.HOST ?? '0.0.0.0';

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // curl, serveur à serveur
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host.endsWith('.e2b.app') || host.endsWith('.e2b.dev')) return true;
    const configured = process.env.FRONTEND_URL;
    if (configured && origin === configured) return true;
    return false;
  } catch {
    return false;
  }
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'production',
    bodyLimit: 8 * 1024 * 1024, // les documents de montage peuvent être volumineux
    disableRequestLogging: process.env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(websocket);

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
  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request: FastifyRequest, reply: FastifyReply) => {
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
  });

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
  await registerRoomRoutes(app);
  await registerRealtimeRoutes(app);
  await registerMiscRoutes(app);

  return app;
}

async function main() {
  const app = await buildApp();
  await app.listen({ port: PORT, host: HOST });
  // eslint-disable-next-line no-console
  console.log(`⚡ Northev Spark API — http://0.0.0.0:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`   REST : /api/*   ·   SSE : /api/rooms/:code/events   ·   WS : /rt/ws/:code`);
}

void main();
