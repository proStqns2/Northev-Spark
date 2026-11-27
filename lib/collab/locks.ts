/**
 * Verrous souples d'atelier.
 *
 * Deux personnes qui glissent la même résistance en même temps produisent deux
 * versions incompatibles. Le verrou n'empêche pas la fusion (voir `merge.ts`),
 * il **prévient** : celui qui tient le verrou est seul à pouvoir le modifier,
 * les autres voient « R₁ est édité par Nora » et peuvent attendre ou demander
 * la main.
 *
 * Caractéristiques :
 *  - **expiration** (TTL) : un onglet fermé brutalement ne bloque rien ;
 *  - **vol** après expiration, jamais avant ;
 *  - **réentrance** : le même utilisateur peut ré-acquérir sans conflit ;
 *  - fonctions pures, testables sans serveur.
 */

export interface LockRecord {
  componentId: string;
  userId: string;
  name: string;
  color: string;
  /** date d’acquisition, ms epoch */
  since: number;
  /** date d’expiration, ms epoch */
  expiresAt: number;
}

export type LockMap = Record<string, LockRecord>;

export const LOCK_TTL_MS = 15_000;

export interface LockRequest {
  componentId: string;
  userId: string;
  name: string;
  color?: string;
}

export interface AcquireResult {
  ok: boolean;
  locks: LockMap;
  /** verrou existant quand `ok` est faux */
  holder?: LockRecord;
  /** vrai quand le verrou a été pris après expiration de l’ancien */
  stolen?: boolean;
}

/** Retire les verrous expirés. */
export function expireLocks(locks: LockMap, now: number): LockMap {
  const next: LockMap = {};
  for (const [id, lock] of Object.entries(locks)) {
    if (lock.expiresAt > now) next[id] = lock;
  }
  return next;
}

/** Titulaire actuel d’un dipôle, ou `null`. */
export function holderOf(locks: LockMap, componentId: string, now: number): LockRecord | null {
  const lock = locks[componentId];
  if (!lock) return null;
  return lock.expiresAt > now ? lock : null;
}

/**
 * Demande le verrou d’un dipôle.
 * - libre ou expiré → accordé ;
 * - déjà tenu par le demandeur → accordé et prolongé (réentrance) ;
 * - tenu par quelqu’un d’autre → refusé, avec le titulaire.
 */
export function acquireLock(
  locks: LockMap,
  request: LockRequest,
  now: number,
  ttl = LOCK_TTL_MS,
): AcquireResult {
  const clean = expireLocks(locks, now);
  const existing = clean[request.componentId];

  if (existing && existing.userId !== request.userId) {
    return { ok: false, locks: clean, holder: existing };
  }

  const wasExpired = Boolean(locks[request.componentId]) && !existing;
  const record: LockRecord = {
    componentId: request.componentId,
    userId: request.userId,
    name: request.name,
    color: existing?.color ?? request.color ?? '#38e1e6',
    since: existing?.since ?? now,
    expiresAt: now + ttl,
  };
  return {
    ok: true,
    locks: { ...clean, [request.componentId]: record },
    stolen: wasExpired || undefined,
  };
}

/** Libère un verrou précis (seul son détenteur peut le faire). */
export function releaseLock(locks: LockMap, componentId: string, userId: string): LockMap {
  const lock = locks[componentId];
  if (!lock || lock.userId !== userId) return locks;
  const next = { ...locks };
  delete next[componentId];
  return next;
}

/** Libère tous les verrous d’un utilisateur (départ, perte de focus). */
export function releaseAll(locks: LockMap, userId: string): LockMap {
  const next: LockMap = {};
  for (const [id, lock] of Object.entries(locks)) {
    if (lock.userId !== userId) next[id] = lock;
  }
  return next;
}

/** Prolonge un verrou déjà tenu (renouvellement périodique côté client). */
export function renewLocks(locks: LockMap, userId: string, now: number, ttl = LOCK_TTL_MS): LockMap {
  const next: LockMap = { ...locks };
  for (const [id, lock] of Object.entries(next)) {
    if (lock.userId === userId) next[id] = { ...lock, expiresAt: now + ttl };
  }
  return next;
}

/** Verrous qui gênent une écriture sur ces dipôles. */
export function blockingLocks(
  locks: LockMap,
  componentIds: string[],
  userId: string,
  now: number,
): LockRecord[] {
  const clean = expireLocks(locks, now);
  return componentIds
    .map((id) => clean[id])
    .filter((lock): lock is LockRecord => Boolean(lock) && lock.userId !== userId);
}

/** Vue destinée à l’interface : qui tient quoi, et pour combien de temps. */
export function lockSummary(locks: LockMap, now: number): Array<Omit<LockRecord, 'expiresAt'> & { ttlMs: number }> {
  return Object.values(expireLocks(locks, now))
    .map((lock) => ({
      componentId: lock.componentId,
      userId: lock.userId,
      name: lock.name,
      color: lock.color,
      since: lock.since,
      ttlMs: Math.max(0, lock.expiresAt - now),
    }))
    .sort((a, b) => a.since - b.since);
}
