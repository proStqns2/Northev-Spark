import { createHash } from 'node:crypto';
import {
  CursorState,
  mutateVolatile,
  PresenceRecord,
  RoomMedia,
  RoomSignal,
  schedulePersist,
  SignalKind,
  snapshot,
  StoredCircuit,
  StoredRoom,
  StoredUser,
  transaction,
} from './store';
import { diffDocs, mergeDocs, sanitizeDoc, type MergeConflict, type MergeStats } from '@/lib/collab/merge';
import { acquireLock, expireLocks, releaseAll, releaseLock, renewLocks, type LockMap } from '@/lib/collab/locks';
import { hashPassword, inviteCode, sha256, verifyPassword } from '@/lib/auth/crypto';
import { sessionTtlMs } from '@/lib/auth/config';
import type { SessionUser } from '@/lib/auth/session';
import {
  backfillUser,
  cloudEnabled,
  deleteRemoteSession,
  pruneRemoteSessions,
  pullCircuits,
  pullRoom,
  pullRoomsFor,
  pullSession,
  pullUserByEmail,
  pullUserById,
  pushCircuit,
  pushRoom,
  pushSession,
} from './supabase';

const AVATARS = ['circuit', 'bolt', 'oscillo', 'resistor', 'magnet', 'chip', 'photon', 'wave'];

const publicUser = (u: StoredUser): SessionUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  avatar: u.avatar,
  theme: u.theme,
});

export const toSessionUser = publicUser;

export async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
  const normalized = email.trim().toLowerCase();
  return snapshot((db) => db.users.find((u) => u.email === normalized));
}

export async function findUserById(id: string): Promise<StoredUser | undefined> {
  return snapshot((db) => db.users.find((u) => u.id === id));
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ user: StoredUser } | { error: string; code: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const existing = await findOrRestoreUser(email);
  if (existing) return { error: 'Un compte existe déjà avec cette adresse.', code: 'email_taken' };

  const now = new Date().toISOString();
  const user: StoredUser = {
    id: `u_${createHash('sha256').update(`${email}${Date.now()}`).digest('hex').slice(0, 16)}`,
    email,
    name,
    passwordHash: hashPassword(input.password),
    // avatar choisi de façon déterministe : deux comptes ne se ressemblent pas
    avatar: AVATARS[createHash('sha256').update(email).digest()[0] % AVATARS.length],
    theme: 'nuit',
    role: 'user',
    createdAt: now,
    lastSeenAt: now,
    prefs: { grid: true, animation: true, electronSpeed: 1, digits: 4 },
  };

  await transaction((db) => {
    db.users.push(user);
  });
  // bloquant : si Supabase est configuré, le compte doit y être avant qu'on
  // réponde, sinon un redéploiement immédiat le rendrait introuvable.
  await backfillUser(user).catch(() => undefined);
  return { user };
}

/**
 * Retrouve un compte, y compris après un redéploiement.
 *
 * Le stockage local (`.data/db.json`) est éphémère sur un hébergement
 * serverless : si le compte n'est plus en mémoire, on le relit depuis
 * Supabase et on le réinsère localement (les sessions restent valides).
 */
async function findOrRestoreUser(email: string): Promise<StoredUser | undefined> {
  const local = await findUserByEmail(email);
  if (local) return local;
  const remote = await pullUserByEmail(email);
  if (!remote) return undefined;
  await transaction((db) => {
    if (!db.users.some((u) => u.id === remote.id || u.email === remote.email)) {
      db.users.push(remote);
    }
  });
  return remote;
}

export async function authenticate(email: string, password: string): Promise<StoredUser | null> {
  const user = await findOrRestoreUser(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  await transaction((db) => {
    const target = db.users.find((u) => u.id === user.id);
    if (target) target.lastSeenAt = new Date().toISOString();
  });
  return user;
}

export async function createSession(userId: string): Promise<string> {
  const token = sha256(`${userId}:${Date.now()}:${Math.random()}`);
  const now = new Date();
  const record = {
    token,
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + sessionTtlMs()).toISOString(),
  };
  await transaction((db) => {
    db.sessions = db.sessions.filter((s) => new Date(s.expiresAt) > now);
    db.sessions.push(record);
  });
  // Persistée aussi côté Supabase : sur un hébergement serverless, la requête
  // suivante peut être servie par une autre instance, qui ne verrait pas la
  // session locale. On n'attend pas la purge des sessions expirées.
  if (cloudEnabled()) {
    await pushSession(record).catch(() => undefined);
    void pruneRemoteSessions().catch(() => undefined);
  }
  return token;
}

export async function resolveSession(token: string): Promise<SessionUser | null> {
  let record = await snapshot((db) => db.sessions.find((s) => s.token === token));

  // Session inconnue en local (autre instance serverless) : on la relit.
  if (!record && cloudEnabled()) {
    const remote = await pullSession(token);
    if (!remote) return null;
    await transaction((db) => {
      if (!db.sessions.some((s) => s.token === remote.token)) db.sessions.push(remote);
    });
    record = remote;
  }
  if (!record) return null;
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await transaction((db) => {
      db.sessions = db.sessions.filter((s) => s.token !== token);
    });
    if (cloudEnabled()) void deleteRemoteSession(token).catch(() => undefined);
    return null;
  }

  let user = await findUserById(record.userId);
  // Compte absent de cette instance : on le récupère depuis Supabase.
  if (!user && cloudEnabled()) {
    const remote = await pullUserById(record.userId);
    if (remote) {
      await transaction((db) => {
        if (!db.users.some((u) => u.id === remote.id)) db.users.push(remote);
      });
      user = remote;
    }
  }
  return user ? publicUser(user) : null;
}

export async function destroySession(token: string): Promise<void> {
  await transaction((db) => {
    db.sessions = db.sessions.filter((s) => s.token !== token);
  });
  if (cloudEnabled()) await deleteRemoteSession(token).catch(() => undefined);
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<StoredUser, 'name' | 'avatar' | 'theme' | 'bio' | 'institution' | 'prefs'>>,
): Promise<SessionUser | null> {
  let updated: StoredUser | undefined;
  await transaction((db) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) return;
    if (patch.name) user.name = patch.name;
    if (patch.avatar) user.avatar = patch.avatar;
    if (patch.theme) user.theme = patch.theme;
    if (patch.bio !== undefined) user.bio = patch.bio;
    if (patch.institution !== undefined) user.institution = patch.institution;
    if (patch.prefs) user.prefs = { ...user.prefs, ...patch.prefs };
    updated = user;
  });
  return updated ? publicUser(updated) : null;
}

/** enregistre une clé API chiffrée pour l'utilisateur */
export async function setUserKey(
  id: string,
  provider: 'gemini' | 'openai',
  entry: { sealed: string; fingerprint: string } | null,
): Promise<boolean> {
  let ok = false;
  await transaction((db) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) return;
    user.keys = user.keys ?? {};
    if (entry === null) delete user.keys[provider];
    else user.keys[provider] = { ...entry, updatedAt: new Date().toISOString() };
    ok = true;
  });
  return ok;
}

/** lit les métadonnées de clés (empreinte seulement) */
export async function userKeyInfo(id: string) {
  const user = await findUserById(id);
  return {
    gemini: user?.keys?.gemini ? { fingerprint: user.keys.gemini.fingerprint, updatedAt: user.keys.gemini.updatedAt } : null,
    openai: user?.keys?.openai ? { fingerprint: user.keys.openai.fingerprint, updatedAt: user.keys.openai.updatedAt } : null,
  };
}

/** récupère la clé chiffrée brute (usage serveur uniquement) */
export async function userSealedKey(id: string, provider: 'gemini' | 'openai'): Promise<string | undefined> {
  const user = await findUserById(id);
  return provider === 'gemini' ? user?.keys?.gemini?.sealed : user?.keys?.openai?.sealed;
}

export async function changePassword(
  id: string,
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await findUserById(id);
  if (!user) return { ok: false, error: 'Compte introuvable.' };
  if (!verifyPassword(oldPassword, user.passwordHash)) {
    return { ok: false, error: 'Ancien mot de passe incorrect.' };
  }
  await transaction((db) => {
    const target = db.users.find((u) => u.id === id);
    if (target) target.passwordHash = hashPassword(newPassword);
    db.sessions = db.sessions.filter((s) => s.userId !== id);
  });
  return { ok: true };
}

export async function countCircuits(ownerId: string): Promise<number> {
  return snapshot((db) => db.circuits.filter((c) => c.ownerId === ownerId).length);
}

/** Synthèse Supabase ⇄ local : rapatrie l'historique cloud du compte. */
export async function syncUserCloud(ownerId: string): Promise<{ imported: number; cloud: boolean }> {
  if (!cloudEnabled()) return { imported: 0, cloud: false };
  const remote = await pullCircuits(ownerId).catch(() => []);
  let imported = 0;
  if (remote.length) {
    await transaction((db) => {
      for (const item of remote) {
        const existing = db.circuits.find((c) => c.id === item.id);
        if (existing) continue;
        db.circuits.push(item);
        imported += 1;
      }
    });
  }
  return { imported, cloud: true };
}

export async function createCircuit(input: {
  ownerId: string;
  name: string;
  notes?: string;
  doc: unknown;
  templateSlug?: string;
  lastResult?: StoredCircuit['lastResult'];
  collaborators?: string[];
  projectId?: string;
}): Promise<StoredCircuit> {
  const now = new Date().toISOString();
  const circuit: StoredCircuit = {
    id: `cir_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`,
    ownerId: input.ownerId,
    name: input.name.slice(0, 120) || 'Montage sans titre',
    notes: input.notes ?? '',
    doc: input.doc,
    templateSlug: input.templateSlug,
    status: 'draft',
    starred: false,
    createdAt: now,
    updatedAt: now,
    lastResult: input.lastResult,
    collaborators: input.collaborators ?? [],
    projectId: input.projectId,
  };
  await transaction((db) => {
    db.circuits.unshift(circuit);
  });
  void pushCircuit(circuit).catch(() => undefined);
  return circuit;
}

export async function listCircuits(
  ownerId: string,
  filter?: { q?: string; starred?: boolean; projectId?: string },
) {
  const items = await snapshot((db) =>
    db.circuits
      .filter((c) => c.ownerId === ownerId || c.collaborators.includes(ownerId))
      .filter((c) => (filter?.starred ? c.starred : true))
      .filter((c) => (filter?.projectId ? c.projectId === filter.projectId : true))
      .filter((c) =>
        filter?.q
          ? c.name.toLowerCase().includes(filter.q.toLowerCase()) ||
            c.notes.toLowerCase().includes(filter.q.toLowerCase())
          : true,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
  return items;
}

export async function getCircuit(id: string, viewerId: string): Promise<StoredCircuit | null> {
  const circuit = await snapshot((db) => db.circuits.find((c) => c.id === id));
  if (!circuit) return null;
  if (circuit.ownerId !== viewerId && !circuit.collaborators.includes(viewerId)) return null;
  return circuit;
}

export async function updateCircuit(
  id: string,
  viewerId: string,
  patch: Partial<Omit<StoredCircuit, 'id' | 'ownerId'>>,
): Promise<StoredCircuit | null> {
  let updated: StoredCircuit | null = null;
  await transaction((db) => {
    const circuit = db.circuits.find((c) => c.id === id);
    if (!circuit) return;
    if (circuit.ownerId !== viewerId && !circuit.collaborators.includes(viewerId)) return;
    Object.assign(circuit, patch, { updatedAt: new Date().toISOString() });
    updated = circuit;
  });
  if (updated) void pushCircuit(updated).catch(() => undefined);
  return updated;
}

export async function deleteCircuit(id: string, viewerId: string): Promise<boolean> {
  let removed = false;
  await transaction((db) => {
    const circuit = db.circuits.find((c) => c.id === id);
    if (!circuit) return;
    if (circuit.ownerId !== viewerId) return;
    db.circuits = db.circuits.filter((c) => c.id !== id);
    db.rooms = db.rooms.filter((r) => r.circuitId !== id);
    removed = true;
  });
  return removed;
}

export async function toggleStar(id: string, viewerId: string): Promise<boolean | null> {
  let value: boolean | null = null;
  await transaction((db) => {
    const circuit = db.circuits.find((c) => c.id === id && c.ownerId === viewerId);
    if (!circuit) return;
    circuit.starred = !circuit.starred;
    value = circuit.starred;
  });
  return value;
}

/* ------------------------------ multiwork ------------------------------ */

export async function createRoom(input: {
  owner: SessionUser;
  name: string;
  circuitId: string;
  doc: unknown;
  projectId?: string;
}): Promise<StoredRoom> {
  const now = new Date().toISOString();
  let code = inviteCode();
  await transaction((db) => {
    while (db.rooms.some((r) => r.code === code && !r.closed)) code = inviteCode();
  });
  const room: StoredRoom = {
    code,
    ownerId: input.owner.id,
    ownerName: input.owner.name,
    name: input.name,
    circuitId: input.circuitId,
    doc: input.doc,
    createdAt: now,
    updatedAt: now,
    presence: {},
    revision: 1,
    messages: [],
    closed: false,
    projectId: input.projectId,
    // la révision de départ sert de base aux premières fusions
    history: [{ revision: 1, doc: input.doc, at: now, authorName: input.owner.name, summary: 'montage initial' }],
  };
  // l'hôte est présent dès l'ouverture de l'atelier
  room.presence[input.owner.id] = {
    id: input.owner.id,
    name: input.owner.name,
    avatar: input.owner.avatar,
    color: colorFor(input.owner.id),
    at: now,
    seenAt: Date.now(),
    activity: 'a ouvert l’atelier',
  };
  await transaction((db) => {
    db.rooms = db.rooms.filter((r) => r.closed || new Date(r.updatedAt).getTime() > Date.now() - 864e5);
    db.rooms.push(room);
  });
  // partagée : une autre instance serverless doit pouvoir rejoindre ce code
  if (cloudEnabled()) await pushRoom(room).catch(() => undefined);
  return room;
}

export async function findRoom(code: string): Promise<StoredRoom | null> {
  if (!/^[1-9][0-9]{4}$/.test(code)) return null;
  const local = await snapshot((db) => db.rooms.find((r) => r.code === code && !r.closed));
  if (local) return local;
  // Atelier ouvert par une autre instance : on le relit et on le garde.
  if (!cloudEnabled()) return null;
  const remote = await pullRoom(code);
  if (!remote) return null;
  await transaction((db) => {
    if (!db.rooms.some((r) => r.code === remote.code)) db.rooms.push(remote);
  });
  return remote;
}

/** Marque la présence comme vivante (attribue un slot) */
export async function ensurePresence(
  code: string,
  user: SessionUser,
): Promise<PresenceRecord | null> {
  return mutateVolatile((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return null;
    const previous = room.presence[user.id];
    const record: PresenceRecord = {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      color: previous?.color ?? colorFor(user.id),
      at: new Date().toISOString(),
      cursor: previous?.cursor,
      idle: previous?.idle,
      activity: previous?.activity,
      seenAt: Date.now(),
    };
    room.presence[user.id] = record;
    room.presenceRev = (room.presenceRev ?? 0) + 1;
    schedulePersist(`room:${code}`, 6000);
    return record;
  });
}

export async function updateCursor(
  code: string,
  user: SessionUser,
  cursor: CursorState | null,
  activity?: string,
): Promise<number | null> {
  return mutateVolatile((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return null;
    const previous = room.presence[user.id];
    room.presence[user.id] = {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      color: previous?.color ?? colorFor(user.id),
      at: new Date().toISOString(),
      cursor: cursor ?? undefined,
      idle: cursor === null,
      activity: activity ?? previous?.activity,
      // la bascule micro/caméra survit aux mouvements de curseur
      media: previous?.media,
      seenAt: Date.now(),
    };
    room.presenceRev = (room.presenceRev ?? 0) + 1;
    schedulePersist(`room:${code}`, 8000);
    return room.presenceRev;
  });
}

/**
 * Mise à jour **partielle** du curseur : sélection, outil, clic. La position
 * connue est conservée — sinon publier une sélection ferait disparaître le
 * curseur du pair jusqu'à son prochain mouvement de souris.
 */
export async function patchCursor(
  code: string,
  user: SessionUser,
  patch: Partial<CursorState>,
  activity?: string,
): Promise<number | null> {
  return mutateVolatile((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return null;
    const previous = room.presence[user.id];
    const cursor = previous?.cursor
      ? { ...previous.cursor, ...patch, at: Date.now() }
      : undefined;
    room.presence[user.id] = {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      color: previous?.color ?? colorFor(user.id),
      at: new Date().toISOString(),
      cursor,
      idle: cursor ? false : previous?.idle,
      activity: activity ?? previous?.activity,
      media: previous?.media,
      seenAt: Date.now(),
    };
    room.presenceRev = (room.presenceRev ?? 0) + 1;
    return room.presenceRev;
  });
}

const CURSOR_TTL = 12000;

/** Présence nettoyée : curseurs expirés retirés, inactifs marqués */
export function livePresence(room: StoredRoom): PresenceRecord[] {
  const now = Date.now();
  const output: PresenceRecord[] = [];
  for (const [id, record] of Object.entries(room.presence)) {
    const seenAt = record.seenAt ?? new Date(record.at).getTime();
    const stale = now - seenAt > CURSOR_TTL;
    output.push({
      ...record,
      id,
      idle: stale ? true : record.idle,
      cursor: stale ? undefined : record.cursor,
    });
  }
  return output;
}

const PALETTE = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff7d6b', '#4f9dff', '#ff79c6', '#facc15'];

/* ------------------------------------------------------------------ visio */

/** Durée de vie d'un signal WebRTC en mémoire : assez pour un aller-retour. */
const SIGNAL_TTL = 45_000;
/** Nombre maximal de signaux conservés par salle (boîte aux lettres bornée). */
const SIGNAL_CAP = 240;

function signalId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `sig_${random.slice(0, 18)}`;
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Publie l'état vidéo d'un participant (rejoint / quitte, micro, caméra).
 * Volatil : rien n'est écrit sur disque, la visio ne laisse aucune trace.
 */
export async function setRoomMedia(
  code: string,
  user: SessionUser,
  media: { live: boolean; mic?: boolean; cam?: boolean; session?: string },
): Promise<number | null> {
  return mutateVolatile((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return null;
    const previous = room.presence[user.id];
    const now = Date.now();
    const record: PresenceRecord = {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      color: previous?.color ?? colorFor(user.id),
      at: new Date().toISOString(),
      cursor: previous?.cursor,
      idle: previous?.idle,
      activity: previous?.activity,
      seenAt: now,
    };
    if (media.live) {
      record.media = {
        live: true,
        mic: media.mic ?? previous?.media?.mic ?? true,
        cam: media.cam ?? previous?.media?.cam ?? true,
        session: media.session ?? previous?.media?.session ?? signalId(),
        at: now,
      };
      record.activity = record.activity ?? 'en visio';
    }
    room.presence[user.id] = record;
    room.presenceRev = (room.presenceRev ?? 0) + 1;
    return room.presenceRev;
  });
}

/** Dépose un message de signalisation pour un pair (ou pour tous). */
export async function pushRoomSignal(
  code: string,
  user: SessionUser,
  input: { to?: string | null; kind: SignalKind; payload?: unknown },
): Promise<RoomSignal | null> {
  return mutateVolatile((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return null;
    const now = Date.now();
    const kept = (room.signals ?? []).filter((signal) => now - signal.at < SIGNAL_TTL);
    const signal: RoomSignal = {
      id: signalId(),
      from: user.id,
      fromName: user.name,
      to: input.to ?? null,
      kind: input.kind,
      payload: input.payload ?? null,
      at: now,
    };
    kept.push(signal);
    room.signals = kept.slice(-SIGNAL_CAP);
    return signal;
  });
}

/**
 * Signaux destinés à `userId` postés depuis `sinceAt`. Le filtrage se fait ici
 * pour qu'aucun message d'un pair ne parte vers un autre client.
 */
export async function roomSignalsFor(
  code: string,
  userId: string,
  sinceAt = 0,
): Promise<RoomSignal[]> {
  return mutateVolatile((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return [];
    const now = Date.now();
    const kept = (room.signals ?? []).filter((signal) => now - signal.at < SIGNAL_TTL);
    if (kept.length !== (room.signals ?? []).length) room.signals = kept;
    return kept.filter(
      (signal) =>
        signal.at >= sinceAt &&
        signal.from !== userId &&
        (signal.to === null || signal.to === userId),
    );
  });
}
function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 100003;
  return PALETTE[hash % PALETTE.length];
}

export async function touchRoom(
  code: string,
  patch: Partial<
    Pick<StoredRoom, 'doc' | 'name' | 'presence' | 'messages' | 'revision' | 'history' | 'locks' | 'typing'>
  >,
): Promise<StoredRoom | null> {
  let updated: StoredRoom | null = null;
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    Object.assign(room, patch, { updatedAt: new Date().toISOString() });
    updated = room;
  });
  const room = updated as StoredRoom | null;
  if (room) {
    // présence et curseurs restent volatils ; le document, la révision et les
    // messages partent vers Supabase (throttlé par la cadence des événements)
    void pushRoom(room).catch(() => undefined);
  }
  return updated;
}

export async function leaveRoom(code: string, userId: string): Promise<void> {
  let closed: StoredRoom | null = null;
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code);
    if (!room) return;
    delete room.presence[userId];
    room.updatedAt = new Date().toISOString();
    if (room.ownerId === userId) {
      const remaining = Object.keys(room.presence);
      if (!remaining.length) room.closed = true;
      else room.ownerId = remaining[0];
    }
    closed = room;
  });
  // la fermeture doit être visible des autres instances
  const room = closed as StoredRoom | null;
  if (room && room.closed && cloudEnabled()) await pushRoom(room).catch(() => undefined);
}

export async function joinRoom(
  code: string,
  user: SessionUser,
): Promise<{ room: StoredRoom } | { error: string; code: string }> {
  const room = await findRoom(code);
  if (!room) return { error: 'Aucun atelier actif avec ce code à 5 chiffres.', code: 'room_not_found' };
  await transaction((db) => {
    const target = db.rooms.find((r) => r.code === code && !r.closed);
    if (!target) return;
    const previous = target.presence[user.id];
    target.presence[user.id] = {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      color: previous?.color ?? colorFor(user.id),
      at: new Date().toISOString(),
      seenAt: Date.now(),
      cursor: previous?.cursor,
      activity: 'a rejoint l’atelier',
    };
    target.updatedAt = new Date().toISOString();
    const circuit = db.circuits.find((c) => c.id === target.circuitId);
    if (circuit && !circuit.collaborators.includes(user.id) && circuit.ownerId !== user.id) {
      circuit.collaborators.push(user.id);
    }
  });
  const fresh = await findRoom(code);
  return { room: fresh ?? room };
}

export async function listRoomsFor(userId: string): Promise<StoredRoom[]> {
  const collect = (rooms: StoredRoom[]) =>
    rooms
      .filter((r) => !r.closed && (r.ownerId === userId || r.presence[userId]))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const local = collect(await snapshot((db) => db.rooms));
  if (!cloudEnabled()) return local;

  const remote = collect(await pullRoomsFor(userId));
  const seen = new Set(local.map((r) => r.code));
  const merged = [...local, ...remote.filter((r) => !seen.has(r.code))];
  return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* ------------------------------- projets ------------------------------- */

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  ownerId: string;
  members: Array<{ id: string; name: string; color: string; role: 'owner' | 'editor' | 'viewer' }>;
  circuits: number;
  openRooms: number;
  lastActivity: string;
  createdAt: string;
  archived: boolean;
  /** ateliers ouverts du projet (code + nom) */
  rooms: Array<{ code: string; name: string; participants: number }>;
}

const PROJECT_COLORS = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff7d6b', '#4f9dff', '#ff79c6'];

export async function listProjects(ownerId: string): Promise<ProjectSummary[]> {
  const snapshotDb = await snapshot((db) => ({
    projects: db.projects.filter(
      (p) =>
        !p.archived &&
        (p.ownerId === ownerId || p.members.some((m) => m.id === ownerId)),
    ),
    circuits: db.circuits,
    rooms: db.rooms,
  }));

  return snapshotDb.projects
    .map((project) => {
      const circuits = snapshotDb.circuits.filter((c) => c.projectId === project.id);
      const rooms = snapshotDb.rooms.filter(
        (r) =>
          !r.closed &&
          (r.projectId === project.id || circuits.some((c) => c.id === r.circuitId)),
      );
      const timestamps = [
        project.createdAt,
        ...circuits.map((c) => c.updatedAt),
        ...rooms.map((r) => r.updatedAt),
      ].sort();
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        icon: project.icon,
        ownerId: project.ownerId,
        members: project.members,
        circuits: circuits.length,
        openRooms: rooms.length,
        lastActivity: timestamps.at(-1) ?? project.createdAt,
        createdAt: project.createdAt,
        archived: project.archived,
        rooms: rooms.map((r) => ({
          code: r.code,
          name: r.name,
          participants: Object.keys(r.presence ?? {}).length,
        })),
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export async function getProject(id: string, viewerId: string) {
  const project = await snapshot((db) => db.projects.find((p) => p.id === id));
  if (!project) return null;
  const allowed =
    project.ownerId === viewerId || project.members.some((m) => m.id === viewerId);
  if (!allowed) return null;
  return project;
}

export async function createProject(input: {
  owner: SessionUser;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  templateSlug?: string;
}): Promise<ProjectSummary> {
  const now = new Date().toISOString();
  const id = `prj_${Math.random().toString(36).slice(2, 10)}`;
  const color = input.color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
  const project = {
    id,
    name: input.name.slice(0, 120) || 'Projet sans titre',
    description: (input.description ?? '').slice(0, 400),
    color,
    icon: input.icon ?? 'circuit',
    ownerId: input.owner.id,
    members: [{ id: input.owner.id, name: input.owner.name, color, role: 'owner' as const }],
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
  await transaction((db) => {
    db.projects.unshift(project);
  });
  return {
    ...project,
    circuits: 0,
    openRooms: 0,
    lastActivity: now,
    rooms: [],
  };
}

export async function updateProject(
  id: string,
  viewerId: string,
  patch: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    archived?: boolean;
  },
): Promise<boolean> {
  let ok = false;
  await transaction((db) => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) return;
    const isOwner = project.ownerId === viewerId;
    const isEditor = project.members.some((m) => m.id === viewerId && m.role === 'editor');
    if (!isOwner && !isEditor) return;
    if (patch.name) project.name = patch.name.slice(0, 120);
    if (patch.description !== undefined) project.description = patch.description.slice(0, 400);
    if (patch.color) project.color = patch.color;
    if (patch.icon) project.icon = patch.icon;
    if (patch.archived !== undefined) project.archived = patch.archived;
    project.updatedAt = new Date().toISOString();
    ok = true;
  });
  return ok;
}

export async function deleteProject(id: string, viewerId: string): Promise<boolean> {
  let ok = false;
  await transaction((db) => {
    const project = db.projects.find((p) => p.id === id);
    if (!project || project.ownerId !== viewerId) return;
    db.projects = db.projects.filter((p) => p.id !== id);
    for (const circuit of db.circuits) {
      if (circuit.projectId === id) circuit.projectId = undefined;
    }
    ok = true;
  });
  return ok;
}

export async function addProjectMember(
  id: string,
  viewerId: string,
  member: { id: string; name: string; role?: 'editor' | 'viewer' },
): Promise<boolean> {
  let ok = false;
  await transaction((db) => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) return;
    const isOwner = project.ownerId === viewerId;
    const isEditor = project.members.some((m) => m.id === viewerId && m.role === 'editor');
    if (!isOwner && !isEditor) return;
    if (project.members.some((m) => m.id === member.id)) return;
    project.members.push({
      id: member.id,
      name: member.name,
      color: colorFor(member.id),
      role: member.role ?? 'editor',
    });
    project.updatedAt = new Date().toISOString();
    ok = true;
  });
  return ok;
}

export async function attachCircuitsToProject(
  projectId: string,
  viewerId: string,
  circuitIds: string[],
): Promise<number> {
  let moved = 0;
  await transaction((db) => {
    const project = db.projects.find((p) => p.id === projectId);
    if (!project) return;
    if (project.ownerId !== viewerId && !project.members.some((m) => m.id === viewerId)) return;
    for (const circuit of db.circuits) {
      if (!circuitIds.includes(circuit.id)) continue;
      if (circuit.ownerId !== viewerId && !circuit.collaborators.includes(viewerId)) continue;
      circuit.projectId = projectId;
      circuit.updatedAt = new Date().toISOString();
      moved += 1;
    }
  });
  return moved;
}


/* ------------------------- multiwork : fusion & verrous ------------------------- */

export interface RoomWriteResult {
  ok: boolean;
  error?: string;
  revision?: number;
  doc?: unknown;
  /** fusible : ce qui a été cumulé */
  stats?: MergeStats;
  /** collisions réelles, à afficher dans l'atelier */
  conflicts?: MergeConflict[];
  /** vrai quand la fusion a dû réécrire le document client (il doit se réaligner) */
  merged?: boolean;
  authorName?: string;
  updatedAt?: string;
}

const HISTORY_LIMIT = 10;

/**
 * Écriture collaborative : le document envoyé est **fusionné** avec l'état
 * courant, jamais substitué. `baseRevision` indique la version que le client
 * connaissait ; le serveur retrouve le document correspondant dans l'historique
 * et fait une fusion à trois branches (`lib/collab/merge`).
 *
 * Un client qui ne fournit pas `baseRevision` est traité comme « à jour » :
 * c'est le comportement historique (dernier écrivain), conservé pour ne pas
 * casser les anciens clients.
 */
export async function applyRoomDoc(
  code: string,
  input: { doc: unknown; baseRevision?: number; author: SessionUser },
): Promise<RoomWriteResult> {
  const mine = sanitizeDoc(input.doc as never);
  let result: RoomWriteResult = { ok: false, error: 'Atelier introuvable ou fermé.' };

  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    const theirs = sanitizeDoc(room.doc as never);
    const history = room.history ?? [];
    const base =
      input.baseRevision === undefined
        ? null
        : history.find((entry) => entry.revision === input.baseRevision)?.doc ?? null;

    const merged = mergeDocs({
      base: base ? sanitizeDoc(base as never) : null,
      mine,
      theirs,
      actor: input.author.name,
    });

    const previousRevision = room.revision;
    const nextRevision = previousRevision + 1;
    const at = new Date().toISOString();
    const diff = diffDocs(theirs, merged.doc);
    const summary = [
      diff.added.length ? `+${diff.added.length}` : '',
      diff.removed.length ? `−${diff.removed.length}` : '',
      diff.updated.length ? `~${diff.updated.length}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (merged.changed) {
      room.doc = merged.doc;
      room.revision = nextRevision;
      room.updatedAt = at;
      // instantané **de la nouvelle révision** : c'est la base du prochain arrivant
      room.history = [
        ...history.filter((entry) => entry.revision !== nextRevision),
        {
          revision: nextRevision,
          doc: merged.doc,
          at,
          authorName: input.author.name,
          summary,
        },
      ].slice(-HISTORY_LIMIT);
    }

    room.presence[input.author.id] = {
      ...room.presence[input.author.id],
      id: input.author.id,
      name: input.author.name,
      avatar: input.author.avatar,
      color: room.presence[input.author.id]?.color ?? colorFor(input.author.id),
      at,
      seenAt: Date.now(),
      activity: summary ? `modifie le montage (${summary})` : 'regarde le montage',
    };
    room.typing = Object.fromEntries(
      Object.entries(room.typing ?? {}).filter(([id, entry]) => id !== input.author.id && Date.now() - entry.at < 6_000),
    );

    result = {
      ok: true,
      revision: room.revision,
      doc: room.doc,
      stats: merged.stats,
      conflicts: merged.conflicts,
      merged: merged.changed && JSON.stringify(merged.doc) !== JSON.stringify(mine),
      authorName: input.author.name,
      updatedAt: room.updatedAt,
    };
  });

  const room = await findRoom(code);
  if (room) void pushRoom(room).catch(() => undefined);
  return result;
}

/** Historique des versions (pour la frise et la restauration). */
export async function roomHistory(code: string): Promise<Array<{ revision: number; at: string; authorName: string; summary: string }>> {
  const room = await findRoom(code);
  if (!room) return [];
  const entries = (room.history ?? []).map((entry) => ({
    revision: entry.revision,
    at: entry.at,
    authorName: entry.authorName,
    summary: entry.revision === room.revision ? 'version courante' : entry.summary,
  }));
  if (!entries.some((entry) => entry.revision === room.revision)) {
    entries.push({
      revision: room.revision,
      at: room.updatedAt,
      authorName: room.ownerName,
      summary: 'version courante',
    });
  }
  return entries.sort((a, b) => b.revision - a.revision);
}

/** Restaure une version antérieure (nouvelle révision, pas de réécriture d’historique). */
export async function restoreRoomRevision(
  code: string,
  revision: number,
  author: SessionUser,
): Promise<RoomWriteResult> {
  let result: RoomWriteResult = { ok: false, error: 'Version introuvable.' };
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    const entry = (room.history ?? []).find((item) => item.revision === revision);
    if (!entry) return;
    const restored = sanitizeDoc(entry.doc as never);
    const at = new Date().toISOString();
    const nextRevision = room.revision + 1;
    room.doc = restored;
    room.revision = nextRevision;
    room.updatedAt = at;
    room.history = [
      ...(room.history ?? []).filter((item) => item.revision !== nextRevision),
      { revision: nextRevision, doc: restored, at, authorName: author.name, summary: `restauration de la rév. ${revision}` },
    ].slice(-HISTORY_LIMIT);
    room.messages = [
      ...room.messages,
      {
        id: `sys-${Date.now().toString(36)}`,
        authorId: author.id,
        authorName: author.name,
        text: `a restauré la version ${revision}.`,
        at,
      },
    ].slice(-80);
    result = { ok: true, revision: room.revision, doc: room.doc, stats: { added: 0, removed: 0, updated: 0, docFields: 0 }, conflicts: [] };
  });
  const room = await findRoom(code);
  if (room) void pushRoom(room).catch(() => undefined);
  return result;
}

/** Prend (ou prolonge) le verrou d’un dipôle. */
export async function lockComponent(
  code: string,
  componentId: string,
  user: SessionUser,
): Promise<{ granted: boolean; holder?: { name: string; componentId: string }; locks: LockMap; ttlMs: number }> {
  let outcome = { granted: false, locks: {} as LockMap, ttlMs: 0, holder: undefined as undefined | { name: string; componentId: string } };
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    const now = Date.now();
    const acquired = acquireLock(room.locks ?? {}, {
      componentId,
      userId: user.id,
      name: user.name,
      color: room.presence[user.id]?.color ?? colorFor(user.id),
    }, now);
    room.locks = acquired.locks;
    outcome = {
      granted: acquired.ok,
      locks: acquired.locks,
      ttlMs: acquired.ok ? Math.max(0, (acquired.locks[componentId]?.expiresAt ?? now) - now) : 0,
      holder: acquired.holder ? { name: acquired.holder.name, componentId: acquired.holder.componentId } : undefined,
    };
  });
  return outcome;
}

/** Libère un dipôle, ou tous ceux de l’utilisateur. */
export async function unlockComponents(code: string, user: SessionUser, componentId?: string): Promise<LockMap> {
  let locks: LockMap = {};
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    const current = expireLocks(room.locks ?? {}, Date.now());
    room.locks = componentId ? releaseLock(current, componentId, user.id) : releaseAll(current, user.id);
    locks = room.locks;
  });
  return locks;
}

/** Prolonge tous les verrous de l’utilisateur (battement client). */
export async function renewRoomLocks(code: string, user: SessionUser): Promise<LockMap> {
  let locks: LockMap = {};
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    room.locks = renewLocks(expireLocks(room.locks ?? {}, Date.now()), user.id, Date.now());
    locks = room.locks;
  });
  return locks;
}

/** État volatil de l’atelier : verrous + saisies en cours. */
export async function roomLiveState(
  code: string,
): Promise<{ locks: LockMap; typing: Array<{ id: string; name: string }> }> {
  const room = await findRoom(code);
  if (!room) return { locks: {}, typing: [] };
  const now = Date.now();
  return {
    locks: expireLocks(room.locks ?? {}, now),
    typing: Object.entries(room.typing ?? {})
      .filter(([, entry]) => now - entry.at < 6_000)
      .map(([id, entry]) => ({ id, name: entry.name })),
  };
}

/** « X est en train d’écrire… » — volatile, expire en 6 s. */
export async function setRoomTyping(code: string, user: SessionUser, active: boolean): Promise<void> {
  await mutateVolatile((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    const typing = { ...(room.typing ?? {}) };
    if (active) typing[user.id] = { name: user.name, at: Date.now() };
    else delete typing[user.id];
    room.typing = Object.fromEntries(Object.entries(typing).filter(([, entry]) => Date.now() - entry.at < 6_000));
  });
}

/** Réaction emoji sur un message. */
export async function reactToMessage(
  code: string,
  user: SessionUser,
  messageId: string,
  emoji: string,
): Promise<boolean> {
  let done = false;
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    const message = room.messages.find((m) => m.id === messageId);
    if (!message) return;
    const reactions = { ...(message.reactions ?? {}) };
    const authors = new Set(reactions[emoji] ?? []);
    if (authors.has(user.id)) authors.delete(user.id);
    else authors.add(user.id);
    if (authors.size) reactions[emoji] = [...authors];
    else delete reactions[emoji];
    message.reactions = reactions;
    room.updatedAt = new Date().toISOString();
    done = true;
  });
  return done;
}
