import { createHash } from 'node:crypto';
import { snapshot, StoredCircuit, StoredRoom, StoredUser, transaction } from './store';
import { hashPassword, inviteCode, sha256, verifyPassword } from '@/lib/auth/crypto';
import { sessionTtlMs } from '@/lib/auth/config';
import { SessionUser } from '@/lib/auth/session';
import { backfillUser, cloudEnabled, pullCircuits, pushCircuit } from './supabase';

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
  const existing = await findUserByEmail(email);
  if (existing) return { error: 'Un compte existe déjà avec cette adresse.', code: 'email_taken' };

  const now = new Date().toISOString();
  const user: StoredUser = {
    id: `u_${createHash('sha256').update(`${email}${Date.now()}`).digest('hex').slice(0, 16)}`,
    email,
    name,
    passwordHash: hashPassword(input.password),
    avatar: 'circuit',
    theme: 'nuit',
    role: 'user',
    createdAt: now,
    lastSeenAt: now,
    prefs: { grid: true, animation: true, electronSpeed: 1, digits: 4 },
  };

  await transaction((db) => {
    db.users.push(user);
  });
  void backfillUser(user).catch(() => undefined);
  return { user };
}

export async function authenticate(email: string, password: string): Promise<StoredUser | null> {
  const user = await findUserByEmail(email);
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
  await transaction((db) => {
    db.sessions = db.sessions.filter((s) => new Date(s.expiresAt) > now);
    db.sessions.push({
      token,
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + sessionTtlMs()).toISOString(),
    });
  });
  return token;
}

export async function resolveSession(token: string): Promise<SessionUser | null> {
  const record = await snapshot((db) => db.sessions.find((s) => s.token === token));
  if (!record) return null;
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await transaction((db) => {
      db.sessions = db.sessions.filter((s) => s.token !== token);
    });
    return null;
  }
  const user = await findUserById(record.userId);
  return user ? publicUser(user) : null;
}

export async function destroySession(token: string): Promise<void> {
  await transaction((db) => {
    db.sessions = db.sessions.filter((s) => s.token !== token);
  });
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
  };
  await transaction((db) => {
    db.circuits.unshift(circuit);
  });
  void pushCircuit(circuit).catch(() => undefined);
  return circuit;
}

export async function listCircuits(ownerId: string, filter?: { q?: string; starred?: boolean }) {
  const items = await snapshot((db) =>
    db.circuits
      .filter((c) => c.ownerId === ownerId || c.collaborators.includes(ownerId))
      .filter((c) => (filter?.starred ? c.starred : true))
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
  };
  // l'hôte est présent dès l'ouverture de l'atelier
  room.presence[input.owner.id] = {
    name: input.owner.name,
    avatar: input.owner.avatar,
    color: '#38e1e6',
    at: now,
  };
  await transaction((db) => {
    db.rooms = db.rooms.filter((r) => r.closed || new Date(r.updatedAt).getTime() > Date.now() - 864e5);
    db.rooms.push(room);
  });
  return room;
}

export async function findRoom(code: string): Promise<StoredRoom | null> {
  if (!/^[1-9][0-9]{4}$/.test(code)) return null;
  const room = await snapshot((db) => db.rooms.find((r) => r.code === code && !r.closed));
  return room ?? null;
}

export async function touchRoom(
  code: string,
  patch: Partial<Pick<StoredRoom, 'doc' | 'name' | 'presence' | 'messages' | 'revision'>>,
): Promise<StoredRoom | null> {
  let updated: StoredRoom | null = null;
  await transaction((db) => {
    const room = db.rooms.find((r) => r.code === code && !r.closed);
    if (!room) return;
    Object.assign(room, patch, { updatedAt: new Date().toISOString() });
    updated = room;
  });
  return updated;
}

export async function leaveRoom(code: string, userId: string): Promise<void> {
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
  });
}

export async function joinRoom(
  code: string,
  user: SessionUser,
): Promise<{ room: StoredRoom } | { error: string; code: string }> {
  const room = await findRoom(code);
  if (!room) return { error: 'Aucun atelier actif avec ce code à 5 chiffres.', code: 'room_not_found' };
  const colors = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff7d6b', '#4f9dff'];
  await transaction((db) => {
    const target = db.rooms.find((r) => r.code === code && !r.closed);
    if (!target) return;
    target.presence[user.id] = {
      name: user.name,
      avatar: user.avatar,
      color: colors[Object.keys(target.presence).length % colors.length],
      at: new Date().toISOString(),
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
  return snapshot((db) =>
    db.rooms
      .filter((r) => !r.closed && (r.ownerId === userId || r.presence[userId]))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}
