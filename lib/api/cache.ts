/**
 * Cache HTTP et micro-cache mémoire.
 *
 * Deux niveaux, complémentaires :
 *  1. `cached()` : un cache applicatif à durée de vie (`stale-while-revalidate`
 *     inclus) pour les catalogues qui coûtent un calcul — glossaire, programme,
 *     banque de quiz ;
 *  2. `etag()` / `respondWithEtag()` : les en-têtes HTTP qui évitent de
 *     renvoyer un corps identique deux fois (`304 Not Modified`).
 *
 * Le cache est volontairement simple : une entrée par clé, pas d’éviction
 * LRU, une purge périodique suffit pour des catalogues de moins de 1 Mo.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
  /** au-delà de cette date, la valeur est servie mais rafraîchie en fond */
  staleAt: number;
  hits: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface CacheOptions {
  /** durée de fraîcheur, en millisecondes */
  ttlMs: number;
  /** durée de validité en mode « périmé mais utilisable », 0 pour désactiver */
  staleMs?: number;
}

/** Statistiques renvoyées par `/api/metrics`. */
export const cacheStats = { hits: 0, misses: 0, staleHits: 0, revalidations: 0 };

export async function cached<T>(key: string, options: CacheOptions, producer: () => Promise<T> | T): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;

  if (entry) {
    if (now < entry.expiresAt) {
      entry.hits += 1;
      cacheStats.hits += 1;
      return entry.value;
    }
    if (options.staleMs && now < entry.staleAt) {
      cacheStats.staleHits += 1;
      if (!inflight.has(key)) {
        cacheStats.revalidations += 1;
        const refresh = Promise.resolve()
          .then(producer)
          .then((value) => {
            store.set(key, {
              value,
              expiresAt: Date.now() + options.ttlMs,
              staleAt: Date.now() + options.ttlMs + (options.staleMs ?? 0),
              hits: entry.hits,
            });
            return value;
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, refresh);
      }
      return entry.value;
    }
  }

  cacheStats.misses += 1;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = Promise.resolve()
    .then(producer)
    .then((value) => {
      store.set(key, {
        value,
        expiresAt: Date.now() + options.ttlMs,
        staleAt: Date.now() + options.ttlMs + (options.staleMs ?? 0),
        hits: 0,
      });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

/** Invalide une clé (ou toutes celles d’un préfixe). */
export function invalidate(prefix?: string): number {
  if (!prefix) {
    const size = store.size;
    store.clear();
    return size;
  }
  let removed = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function cacheInfo(): { keys: string[]; size: number; stats: typeof cacheStats } {
  return {
    keys: [...store.keys()].slice(0, 40),
    size: store.size,
    stats: { ...cacheStats },
  };
}

/* ------------------------------------------------------------------ */
/* ETag                                                                 */
/* ------------------------------------------------------------------ */

/** Empreinte stable d’une charge utile (JSON trié en profondeur). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

export function etagOf(value: unknown): string {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second + code, 0x85ebca6b) >>> 0;
  }
  return `W/"${first.toString(36)}-${second.toString(36)}-${text.length.toString(36)}"`;
}

/** Vrai si le client possède déjà cette version. */
export function ifNoneMatch(headers: Record<string, string | undefined>, etag: string): boolean {
  const header = headers['if-none-match'];
  if (!header) return false;
  if (header.trim() === '*') return true;
  const candidates = header.split(',').map((value) => value.trim().replace(/^W\//, ''));
  return candidates.includes(etag.replace(/^W\//, ''));
}

export interface EtagOptions {
  /** secondes de cache navigateur */
  maxAge?: number;
  /** secondes pendant lesquelles la version périmée peut être servie */
  staleWhileRevalidate?: number;
  /** `private` pour les réponses liées à un utilisateur */
  visibility?: 'public' | 'private';
  /** en-têtes supplémentaires */
  headers?: Record<string, string>;
}

/**
 * Réponse JSON conditionnelle : renvoie 304 sans corps si l’ETag correspond,
 * sinon le JSON avec `ETag` et `Cache-Control`.
 */
export function jsonWithEtag(
  headers: Record<string, string | undefined>,
  payload: unknown,
  options: EtagOptions = {},
): Response {
  const etag = etagOf(payload);
  const { maxAge = 60, staleWhileRevalidate = 300, visibility = 'public' } = options;
  const cacheControl = `${visibility}, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;

  if (ifNoneMatch(headers, etag)) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': cacheControl, ...(options.headers ?? {}) },
    });
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: etag,
      'Cache-Control': cacheControl,
      Vary: 'Cookie, Accept-Encoding',
      ...(options.headers ?? {}),
    },
  });
}
