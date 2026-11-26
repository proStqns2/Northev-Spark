import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, sessionTtlMs } from '@/lib/auth/config';
import { resolveSession } from '@/lib/db/repo';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Helpers partagés par toutes les routes du backend Northev Spark.
 *
 * Le backend est un serveur Node autonome (Fastify) : il ne dépend plus de
 * Next.js. Les cookies de session sont lus/écrits directement sur les
 * en-têtes HTTP, sans `next/headers`.
 */

export const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

/** Lit le jeton de session dans l'en-tête Cookie (sans dépendance externe). */
export function getSessionToken(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === SESSION_COOKIE) {
      try {
        return decodeURIComponent(trimmed.slice(eq + 1));
      } catch {
        return trimmed.slice(eq + 1);
      }
    }
  }
  return null;
}

/** Utilisateur courant (ou null si la session est absente/invalide). */
export async function currentUser(request: FastifyRequest): Promise<SessionUser | null> {
  const token = getSessionToken(request);
  return token ? resolveSession(token) : null;
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const secure = process.env.NODE_ENV === 'production';
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(
      sessionTtlMs() / 1000,
    )}${secure ? '; Secure' : ''}`,
  );
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

/** Corps JSON déjà parsé par Fastify ({} si absent). */
export function bodyOf<T = Record<string, unknown>>(request: FastifyRequest): T {
  return (request.body ?? {}) as T;
}

/** Réponse d'erreur au format attendu par les frontends : { error }. */
export function fail(reply: FastifyReply, status: number, error: string, extra?: Record<string, unknown>) {
  return reply.code(status).send({ error, ...extra });
}
