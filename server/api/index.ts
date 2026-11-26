/**
 * Northev Spark — hôte Node autonome de l'API (Fastify).
 *
 * Sert toute l'API : REST, SSE des salles et WebSocket de l'atelier Angular.
 * Next.js n'est plus qu'un frontend et relaie `/api/*` vers ce serveur en
 * développement comme en production (voir `rewrites` dans next.config.mjs).
 *
 * Le même code sert aussi de fonction Vercel : `app/api/[...path]/route.ts`
 * construit l'application avec `buildApp({ realtime: false })` puis l'appelle
 * par `inject()`, sans jamais ouvrir de port.
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

import { buildApp } from './buildApp';

const PORT = Number(process.env.PORT ?? 4100);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  const app = await buildApp({ realtime: true });
  await app.listen({ port: PORT, host: HOST });
  // eslint-disable-next-line no-console
  console.log(`⚡ Northev Spark API — http://0.0.0.0:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`   REST : /api/*   ·   SSE : /api/rooms/:code/events   ·   WS : /rt/ws/:code`);
}

void main();
