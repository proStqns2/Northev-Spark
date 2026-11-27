import { ApiReply, matchRoute, pathExists, type ApiRoute } from '@/lib/api/http';
import { authRoutes } from '@/lib/api/routes/auth';
import { profileRoutes } from '@/lib/api/routes/profile';
import { circuitRoutes } from '@/lib/api/routes/circuits';
import { projectRoutes } from '@/lib/api/routes/projects';
import { roomRoutes } from '@/lib/api/routes/rooms';
import { aiRoutes } from '@/lib/api/routes/ai';
import { miscRoutes } from '@/lib/api/routes/misc';
import { solveRoutes } from '@/lib/api/routes/solve';
import { templateRoutes } from '@/lib/api/routes/templates';
import { valueRoutes } from '@/lib/api/routes/values';

/**
 * API du site — route handler Next.js natif.
 *
 * Il n'y a plus de serveur annexe : tout le contrôle (pages React, API,
 * authentification, temps réel) vit dans cette application Next.js. Une
 * requête `/api/…` arrive ici, la table ci-dessous choisit le handler et
 * renvoie directement une `Response` Web.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ROUTES: readonly ApiRoute[] = [
  ...authRoutes,
  ...profileRoutes,
  ...circuitRoutes,
  ...projectRoutes,
  ...roomRoutes,
  ...aiRoutes,
  ...miscRoutes,
  ...solveRoutes,
  ...templateRoutes,
  ...valueRoutes,
];

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

async function readBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const type = request.headers.get('content-type') ?? '';
  const raw = await request.text();
  if (!raw) return {};
  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  // formulaire classique ou texte brut
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}

async function dispatch(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const { path: segments = [] } = await context.params;
  const url = new URL(request.url);
  const pathname = `/${['api', ...segments].join('/')}`;

  const matched = matchRoute(ROUTES, request.method.toUpperCase(), pathname);
  if (!matched) {
    const status = pathExists(ROUTES, pathname) ? 405 : 404;
    return Response.json(
      { error: status === 405 ? 'Méthode non autorisée pour cette route.' : 'Route introuvable.' },
      { status, headers: NO_STORE },
    );
  }

  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const reply = new ApiReply().header('Cache-Control', NO_STORE['Cache-Control']);
  try {
    const result = await matched.handler(
      { body: await readBody(request), params: matched.params, query, headers, url: request.url },
      reply,
    );
    return result instanceof Response ? result : reply.toResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue.';
    console.error(`[api] ${request.method} ${pathname} →`, e);
    return Response.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}

export const GET = dispatch;
export const POST = dispatch;
export const PATCH = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
export const HEAD = dispatch;
export const OPTIONS = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
