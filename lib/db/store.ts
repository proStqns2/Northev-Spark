import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Persistance JSON locale (mode démo sans Supabase).
 * En production, les mêmes enregistrements sont écrits dans Supabase
 * (voir lib/db/supabase.ts) : le schéma SQL est fourni dans supabase/schema.sql.
 */
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatar: string;
  theme: string;
  role: 'user' | 'pro';
  createdAt: string;
  lastSeenAt: string;
  bio?: string;
  institution?: string;
  /** clés API personnelles, chiffrées (jamais renvoyées en clair) */
  keys?: {
    gemini?: { sealed: string; fingerprint: string; updatedAt: string };
    openai?: { sealed: string; fingerprint: string; updatedAt: string };
  };
  prefs: {
    grid?: boolean;
    animation?: boolean;
    electronSpeed?: number;
    digits?: number;
  };
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoredCircuit {
  id: string;
  ownerId: string;
  name: string;
  notes: string;
  doc: unknown;
  templateSlug?: string;
  status: 'draft' | 'published' | 'archived';
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  lastResult?: {
    vth: number;
    rth: number;
    inorton: number;
    regime: 'dc' | 'ac';
  };
  collaborators: string[];
  /** appartenance à un projet (regroupement d'ateliers et de montages) */
  projectId?: string;
}

export interface CursorState {
  /** coordonnées dans la grille (cellules) */
  x: number;
  y: number;
  /** zone approximative du viewport, en cellules (0 → 1) pour le mini-map */
  vx?: number;
  vy?: number;
  vw?: number;
  vh?: number;
  /** nœud survolé / composant actif */
  hover?: string | null;
  /** outil actif de l'utilisateur */
  tool?: string;
  /** horodatage côté client (ms) */
  at: number;
}

export interface PresenceRecord {
  id?: string;
  name: string;
  avatar: string;
  color: string;
  at: string;
  cursor?: CursorState;
  /** curseur masqué par l'utilisateur */
  idle?: boolean;
  /** dernière action lisible : « déplace R₁ », « trace un fil »… */
  activity?: string;
  /** horodatage serveur de la dernière mise à jour de présence */
  seenAt?: number;
}

export interface StoredRoom {
  code: string;
  ownerId: string;
  ownerName: string;
  name: string;
  circuitId: string;
  doc: unknown;
  createdAt: string;
  updatedAt: string;
  presence: Record<string, PresenceRecord>;
  revision: number;
  messages: Array<{ id: string; authorId: string; authorName: string; text: string; at: string }>;
  closed: boolean;
  /** projet auquel l'atelier est rattaché */
  projectId?: string;
  /** numéro de la version des curseurs (ne force pas la persistance disque) */
  presenceRev?: number;
}

export interface StoredProject {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  ownerId: string;
  members: Array<{ id: string; name: string; color: string; role: 'owner' | 'editor' | 'viewer' }>;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface ProgressRecord {
  userId: string;
  xp: number;
  days: string[];
  streak: number;
  bestStreak: number;
  lastActive: string | null;
  lessons: Record<string, { done: boolean; at: string; xp: number }>;
  quizzes: Record<string, { best: number; attempts: number; at: string }>;
  badges: Record<string, string>;
  challenges: Record<string, { solvedAt: string; score: number }>;
  /** gabarits déjà ouverts par l’élève (débloque les badges de visite) */
  templates: string[];
  /** exercices numériques résolus */
  drills: { solved: number; correct: number; byKind: Record<string, { solved: number; correct: number }> };
  updatedAt: string;
}

export interface DB {
  users: StoredUser[];
  sessions: SessionRecord[];
  circuits: StoredCircuit[];
  rooms: StoredRoom[];
  projects: StoredProject[];
  /** progression académique, une ligne par utilisateur */
  progress: ProgressRecord[];
  meta: { schema: number; createdAt: string };
}

const EMPTY: DB = {
  users: [],
  sessions: [],
  circuits: [],
  rooms: [],
  projects: [],
  progress: [],
  meta: { schema: 3, createdAt: new Date().toISOString() },
};

const globalForDb = globalThis as unknown as {
  __northevChain?: Promise<unknown>;
  __northevDb?: DB;
};

async function ensureDir() {
  try {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  } catch {
    // read-only FS (déploiement serverless sans Supabase) → bascule mémoire
    const fallback = path.join(os.tmpdir(), 'northev-spark');
    await fs.mkdir(fallback, { recursive: true }).catch(() => {});
  }
}

async function readDb(): Promise<DB> {
  if (globalForDb.__northevDb) return globalForDb.__northevDb;
  await ensureDir();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DB;
    parsed.users ??= [];
    parsed.sessions ??= [];
    parsed.circuits ??= [];
    parsed.rooms ??= [];
    parsed.projects ??= [];
    parsed.progress ??= [];
    for (const row of parsed.progress) row.drills ??= { solved: 0, correct: 0, byKind: {} };
    globalForDb.__northevDb = parsed;
    return parsed;
  } catch {
    const db = structuredClone(EMPTY);
    globalForDb.__northevDb = db;
    return db;
  }
}

async function persist(db: DB): Promise<void> {
  globalForDb.__northevDb = db;
  try {
    await ensureDir();
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch {
    // mode mémoire : l'écriture échoue silencieusement (démo éphémère)
  }
}

/** Sérialise toutes les mutations pour éviter les écritures concurrentes. */
export function transaction<T>(fn: (db: DB) => Promise<T> | T): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await readDb();
    const result = await fn(db);
    await persist(db);
    return result;
  };
  const previous = globalForDb.__northevChain ?? Promise.resolve();
  const next = previous.then(run, run);
  globalForDb.__northevChain = next.catch(() => undefined);
  return next;
}

/**
 * Mutation immédiate, en mémoire, sans écriture disque.
 * Réservée aux données très fréquentes (curseurs, présence) : le disque
 * serait saturé par 10 écritures par seconde et par participant.
 */
export async function mutateVolatile<T>(fn: (db: DB) => T): Promise<T> {
  const db = await readDb();
  return fn(db);
}

/** Écriture différée (debounce) pour les données chaudes mais persistables. */
const pendingWrites = new Map<string, NodeJS.Timeout>();

export function schedulePersist(key: string, delayMs = 4000): void {
  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key);
      void (async () => {
        const db = await readDb();
        await persist(db);
      })();
    }, delayMs),
  );
}

export async function snapshot<T>(fn: (db: DB) => T): Promise<T> {
  const db = await readDb();
  return fn(db);
}

export async function resetDemoData(): Promise<void> {
  await transaction((db) => {
    db.users = [];
    db.sessions = [];
    db.circuits = [];
    db.rooms = [];
    db.projects = [];
  });
}
