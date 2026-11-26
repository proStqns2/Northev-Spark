/**
 * Couche HTTP native du site — aucune dépendance à Fastify ni à un serveur
 * séparé. Tout passe par les *route handlers* de Next.js (Web `Request` →
 * Web `Response`), donc le site entier tient dans une seule application
 * Next.js / React, du rendu des pages jusqu'aux API.
 */

export interface ApiRequest {
  /** corps JSON déjà analysé ({} si absent) */
  body: unknown;
  /** paramètres dynamiques du chemin (`/api/projects/:id`) */
  params: Record<string, string>;
  /** query string aplati */
  query: Record<string, string>;
  /** en-têtes de la requête, en minuscules */
  headers: Record<string, string | undefined>;
  /** URL complète de la requête */
  url: string;
}

/** Réponse mutable, calquée sur l'API `reply` utilisée par les handlers. */
export class ApiReply {
  private statusCode = 200;
  private readonly headers = new Headers();
  private payload: unknown = { ok: true };

  code(status: number): this {
    this.statusCode = status;
    return this;
  }

  header(key: string, value: string): this {
    this.headers.set(key, value);
    return this;
  }

  /** Enregistre la charge utile et renvoie la réponse Web correspondante. */
  send(payload?: unknown): Response {
    this.payload = payload === undefined ? { ok: true } : payload;
    return this.toResponse();
  }

  toResponse(): Response {
    const headers = new Headers(this.headers);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(this.payload), { status: this.statusCode, headers });
  }
}

export type ApiHandler = (
  request: ApiRequest,
  reply: ApiReply,
) => Promise<Response | void> | Response | void;

export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Une route : verbe, motif de chemin (`:id` = segment dynamique), handler. */
export type ApiRoute = [method: ApiMethod, pattern: string, handler: ApiHandler];

interface Matched {
  handler: ApiHandler;
  params: Record<string, string>;
}

/** Trouve la route correspondant au verbe + chemin, avec ses paramètres. */
export function matchRoute(routes: readonly ApiRoute[], method: string, pathname: string): Matched | null {
  const parts = pathname.split('/').filter(Boolean);

  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue;
    const expected = pattern.split('/').filter(Boolean);
    if (expected.length !== parts.length) continue;

    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < expected.length; i += 1) {
      const segment = expected[i];
      if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(parts[i]);
      else if (segment !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler, params };
  }

  return null;
}

/** Vrai si le chemin existe pour au moins un autre verbe (→ 405). */
export function pathExists(routes: readonly ApiRoute[], pathname: string): boolean {
  return (['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as ApiMethod[]).some(
    (method) => matchRoute(routes, method, pathname) !== null,
  );
}
