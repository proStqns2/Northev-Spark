import { SESSION_COOKIE, sessionTtlMs } from '@/lib/auth/config';
import { resolveSession } from '@/lib/db/repo';
import type { SessionUser } from '@/lib/auth/session';
import type { ApiReply, ApiRequest } from './http';

/**
 * Helpers partagés par toutes les routes.
 *
 * Depuis la consolidation, l'API vit **dans** l'application Next.js : les
 * cookies sont lus sur les en-têtes de la requête Web et posés sur la
 * réponse Web. Plus de serveur annexe, plus de relais réseau.
 */

export const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

/** Lit le jeton de session dans l'en-tête Cookie. */
export function getSessionToken(request: ApiRequest): string | null {
  return sessionTokenFromHeader(request.headers.cookie);
}

export function sessionTokenFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === SESSION_COOKIE) {
      const raw = trimmed.slice(eq + 1);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/** Utilisateur courant (ou null si la session est absente / invalide). */
export async function currentUser(request: ApiRequest): Promise<SessionUser | null> {
  const token = getSessionToken(request);
  return token ? resolveSession(token) : null;
}

/** Variante pour les route handlers qui ne possèdent que des `Headers`. */
export async function currentUserFromHeaders(headers: Headers): Promise<SessionUser | null> {
  const token = sessionTokenFromHeader(headers.get('cookie'));
  return token ? resolveSession(token) : null;
}

export function setSessionCookie(reply: ApiReply, token: string): void {
  const secure = process.env.NODE_ENV === 'production';
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
      sessionTtlMs() / 1000,
    )}${secure ? '; Secure' : ''}`,
  );
}

export function clearSessionCookie(reply: ApiReply): void {
  reply.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

/** Corps JSON déjà analysé par le répartiteur ({} si absent). */
export function bodyOf<T = Record<string, unknown>>(request: ApiRequest): T {
  return (request.body ?? {}) as T;
}

/** Réponse d'erreur au format attendu par le frontend : { error }. */
export function fail(reply: ApiReply, status: number, error: string, extra?: Record<string, unknown>) {
  return reply.code(status).send({ error, ...extra });
}
