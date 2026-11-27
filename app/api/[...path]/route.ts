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
import { learningRoutes } from '@/lib/api/routes/learning';
import { dataRoutes } from '@/lib/api/routes/data';
import { valueRoutes } from '@/lib/api/routes/values';
import { agentRoutes } from '@/lib/api/routes/agents';
import { consume, identityOf, rateHeaders } from '@/lib/api/rateLimit';
import { recordError, recordRequest } from '@/lib/api/metrics';

/**
 * API du site — route handler Next.js natif.
 *
 * L'authentification, les données et le temps réel restent sur Next.js. Les
 * routes `/api/values` peuvent relayer l'analyse vers Express, avec un
 * repli local si le service n'est pas disponible.
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
  ...learningRoutes,
  ...dataRoutes,
  ...valueRoutes,
  ...agentRoutes,
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

  const startedAt = Date.now();
  const method = request.method.toUpperCase();

  // 1. quota par identité et par famille de routes
  const decision = consume(identityOf(headers), method, pathname);
  if (!decision.allowed) {
    const body = {
      error: 'Trop de requêtes : ralentissez un instant.',
      retryAfter: decision.retryAfter,
      policy: decision.rule,
    };
    const limited = Response.json(body, {
      status: 429,
      headers: { ...NO_STORE, ...rateHeaders(decision) },
    });
    recordRequest({ method, path: pathname, status: 429, durationMs: Date.now() - startedAt, at: startedAt });
    return limited;
  }

  const reply = new ApiReply().header('Cache-Control', NO_STORE['Cache-Control']);
  try {
    const result = await matched.handler(
      { body: await readBody(request), params: matched.params, query, headers, url: request.url },
      reply,
    );
    const response = result instanceof Response ? result : reply.toResponse();
    const durationMs = Date.now() - startedAt;
    applyTelemetry(response, decision, durationMs);
    recordRequest({ method, path: pathname, status: response.status, durationMs, at: startedAt });
    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erreur inattendue.';
    console.error(`[api] ${method} ${pathname} →`, e);
    recordError(method, pathname, 500, message);
    recordRequest({ method, path: pathname, status: 500, durationMs: Date.now() - startedAt, at: startedAt });
    return Response.json({ error: message }, { status: 500, headers: { ...NO_STORE, ...rateHeaders(decision) } });
  }
}

/**
 * Ajoute les en-têtes d’observabilité à une réponse déjà construite.
 * `Response.headers` est mutable tant que la réponse n’a pas été envoyée ;
 * on protège quand même l’appel (certaines réponses, comme les redirections
 * issues de `fetch`, sont immuables).
 */
function applyTelemetry(response: Response, decision: ReturnType<typeof consume>, durationMs: number): void {
  try {
    for (const [key, value] of Object.entries(rateHeaders(decision))) response.headers.set(key, value);
    response.headers.set('X-Response-Time', `${durationMs}ms`);
    response.headers.set('Server-Timing', `app;dur=${durationMs}`);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  } catch {
    // réponse immuable : on n’échoue jamais à cause d’un en-tête
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
