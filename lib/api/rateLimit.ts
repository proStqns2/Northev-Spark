/**
 * Limitation de débit — seau à jetons en mémoire.
 *
 * Objectif : protéger les routes coûteuses (connexion, assistant IA,
 * résolution de circuit, création de salle) sans dépendre d’un service
 * externe. Chaque identité (cookie de session, sinon IP) dispose d’un seau
 * par famille de routes ; les jetons se rechargent linéairement.
 *
 * Limite assumée : la mémoire est celle de l’instance. Sur Vercel, plusieurs
 * instances peuvent coexister, donc la limite est « par instance » et non
 * globale. C’est suffisant pour arrêter les boucles d’un client fautif, et
 * documenté explicitement pour ne pas mentir sur la garantie.
 */

export interface RateRule {
  /** nom lisible, renvoyé dans les en-têtes `X-RateLimit-Policy` */
  name: string;
  /** méthode HTTP concernée, `*` pour toutes */
  method: string;
  /** expression sur le chemin */
  pattern: RegExp;
  /** jetons disponibles dans la fenêtre */
  limit: number;
  /** durée de reconstitution complète, en millisecondes */
  windowMs: number;
  /** coût d’un appel (2 pour une route très lourde) */
  cost?: number;
}

export const RATE_RULES: RateRule[] = [
  { name: 'auth', method: 'POST', pattern: /^\/api\/auth\/(login|register|password|reset)/, limit: 12, windowMs: 5 * 60_000, cost: 1 },
  { name: 'ai', method: 'POST', pattern: /^\/api\/ai\//, limit: 30, windowMs: 60_000, cost: 1 },
  { name: 'solve', method: 'POST', pattern: /^\/api\/solve/, limit: 90, windowMs: 60_000, cost: 1 },
  { name: 'rooms', method: 'POST', pattern: /^\/api\/rooms/, limit: 40, windowMs: 60_000, cost: 1 },
  { name: 'events', method: 'GET', pattern: /^\/api\/rooms\/[^/]+\/events/, limit: 30, windowMs: 60_000, cost: 1 },
  { name: 'write', method: 'POST', pattern: /^\/api\//, limit: 180, windowMs: 60_000, cost: 1 },
  { name: 'write-generic', method: 'PATCH', pattern: /^\/api\//, limit: 180, windowMs: 60_000, cost: 1 },
  { name: 'write-put', method: 'PUT', pattern: /^\/api\//, limit: 120, windowMs: 60_000, cost: 1 },
  { name: 'delete', method: 'DELETE', pattern: /^\/api\//, limit: 90, windowMs: 60_000, cost: 1 },
  { name: 'read', method: 'GET', pattern: /^\/api\//, limit: 900, windowMs: 60_000, cost: 1 },
];

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();
let operations = 0;

/** Au-delà de ce seuil, on purge les seaux inactifs. */
const PURGE_EVERY = 5_000;
const PURGE_AFTER_MS = 30 * 60_000;

export interface RateDecision {
  allowed: boolean;
  rule: string | null;
  limit: number;
  remaining: number;
  /** timestamp (ms) auquel le seau sera plein */
  resetAt: number;
  /** secondes à attendre si refusé */
  retryAfter: number;
}

export function ruleFor(method: string, pathname: string): RateRule | null {
  const upper = method.toUpperCase();
  for (const rule of RATE_RULES) {
    if (rule.method !== '*' && rule.method !== upper) continue;
    if (rule.pattern.test(pathname)) return rule;
  }
  return null;
}

/**
 * Identité de l’appelant : le cookie de session s’il existe (une même
 * personne derrière un proxy partagé garde son quota), sinon l’IP transmise
 * par la plateforme.
 */
export function identityOf(headers: Record<string, string | undefined>): string {
  const cookie = headers.cookie ?? '';
  const session = /(?:^|;\s*)(spark_session|sb-access-token)=([^;]+)/.exec(cookie);
  if (session) {
    // on ne stocke jamais le jeton en clair dans la table des seaux
    let hash = 2166136261;
    for (let index = 0; index < session[2].length; index += 1) {
      hash ^= session[2].charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `s:${(hash >>> 0).toString(36)}`;
  }
  const forwarded = headers['x-forwarded-for'] ?? headers['x-real-ip'] ?? 'local';
  return `i:${forwarded.split(',')[0].trim()}`;
}

/** Consomme un jeton ; renvoie la décision et l’état restant. */
export function consume(identity: string, method: string, pathname: string, now = Date.now()): RateDecision {
  const rule = ruleFor(method, pathname);
  if (!rule) {
    return { allowed: true, rule: null, limit: 0, remaining: 0, resetAt: now, retryAfter: 0 };
  }

  const cost = rule.cost ?? 1;
  const key = `${identity}|${rule.name}`;
  const refillRate = rule.limit / rule.windowMs;
  const bucket = buckets.get(key) ?? { tokens: rule.limit, updatedAt: now };

  const elapsed = Math.max(0, now - bucket.updatedAt);
  const refilled = Math.min(rule.limit, bucket.tokens + elapsed * refillRate);

  operations += 1;
  if (operations % PURGE_EVERY === 0) purge(now);

  if (refilled < cost) {
    buckets.set(key, { tokens: refilled, updatedAt: now });
    const missing = cost - refilled;
    const waitMs = Math.ceil(missing / refillRate);
    return {
      allowed: false,
      rule: rule.name,
      limit: rule.limit,
      remaining: Math.floor(refilled),
      resetAt: now + Math.ceil((rule.limit - refilled) / refillRate),
      retryAfter: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  const tokens = refilled - cost;
  buckets.set(key, { tokens, updatedAt: now });
  return {
    allowed: true,
    rule: rule.name,
    limit: rule.limit,
    remaining: Math.floor(tokens),
    resetAt: now + Math.ceil((rule.limit - tokens) / refillRate),
    retryAfter: 0,
  };
}

/** En-têtes normalisés à joindre à toute réponse `/api`. */
export function rateHeaders(decision: RateDecision): Record<string, string> {
  if (!decision.rule) return {};
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(decision.limit),
    'X-RateLimit-Remaining': String(Math.max(0, decision.remaining)),
    'X-RateLimit-Reset': String(Math.ceil(decision.resetAt / 1000)),
    'X-RateLimit-Policy': decision.rule,
  };
  if (!decision.allowed) headers['Retry-After'] = String(decision.retryAfter);
  return headers;
}

function purge(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > PURGE_AFTER_MS) buckets.delete(key);
  }
}

/** Vue de diagnostic (utilisée par `/api/metrics`). */
export function rateStats(): { buckets: number; rules: number } {
  return { buckets: buckets.size, rules: RATE_RULES.length };
}

/** Réinitialisation réservée aux tests. */
export function resetRateLimits(): void {
  buckets.clear();
  operations = 0;
}
