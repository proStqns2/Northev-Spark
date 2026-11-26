import type { FastifyInstance } from 'fastify';
import { buildApp } from '@/server/api/buildApp';

/**
 * Passerelle `/api/*` de Next.js.
 *
 * Deux fonctionnements, même code métier :
 *
 *  1. `API_URL` défini (poste de développement, backend Node déjà lancé) :
 *     la requête est relayée telle quelle vers ce serveur. Un seul processus
 *     écrit alors dans `.data/db.json`, comme avant.
 *
 *  2. `API_URL` absent (Vercel) : l'application Fastify est construite dans la
 *     fonction et appelée par `inject()` — aucun port n'est ouvert, la latence
 *     d'un aller-retour réseau disparaît, et les routes sont exactement les
 *     mêmes que celles du serveur autonome.
 *
 * Le flux SSE des salles a son propre fichier (`app/api/rooms/[code]/events`).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let appPromise: Promise<FastifyInstance> | null = null;

function embeddedApp(): Promise<FastifyInstance> {
  appPromise ??= buildApp({ realtime: false });
  return appPromise;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'accept-encoding',
]);

async function proxy(request: Request, target: string, path: string): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) headers.set(key, value);
  });

  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  const response = await fetch(`${target}${path}${url.search}`, {
    method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  const outHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) outHeaders.set(key, value);
  });
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    outHeaders.append('set-cookie', cookie);
  }

  return new Response(response.body, { status: response.status, headers: outHeaders });
}

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const { path: segments = [] } = await context.params;
  const url = new URL(request.url);
  const path = `/api/${segments.join('/')}`;

  const target = process.env.API_URL;
  if (target) {
    try {
      return await proxy(request, target.replace(/\/$/, ''), path);
    } catch {
      return Response.json(
        { error: 'API injoignable', detail: `Aucun serveur ne répond sur ${target}.` },
        { status: 502 },
      );
    }
  }

  const app = await embeddedApp();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) headers[key] = value;
  });

  const method = request.method.toUpperCase();
  const payload = ['GET', 'HEAD'].includes(method) ? undefined : await request.text();

  const injected = await app.inject({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD',
    url: `${path}${url.search}`,
    headers,
    payload,
  });

  const outHeaders = new Headers();
  for (const [key, value] of Object.entries(injected.headers)) {
    if (value === undefined || HOP_BY_HOP.has(key) || key === 'set-cookie') continue;
    outHeaders.set(key, String(value));
  }
  const cookies = injected.headers['set-cookie'];
  if (cookies) {
    for (const cookie of Array.isArray(cookies) ? cookies : [cookies]) {
      outHeaders.append('set-cookie', cookie);
    }
  }

  const body = injected.rawPayload.length ? new Uint8Array(injected.rawPayload) : null;
  return new Response(body, { status: injected.statusCode, headers: outHeaders });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
