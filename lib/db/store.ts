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
  presence: Record<string, { name: string; avatar: string; color: string; at: string }>;
  revision: number;
  messages: Array<{ id: string; authorId: string; authorName: string; text: string; at: string }>;
  closed: boolean;
}

export interface DB {
  users: StoredUser[];
  sessions: SessionRecord[];
  circuits: StoredCircuit[];
  rooms: StoredRoom[];
  meta: { schema: number; createdAt: string };
}

const EMPTY: DB = {
  users: [],
  sessions: [],
  circuits: [],
  rooms: [],
  meta: { schema: 1, createdAt: new Date().toISOString() },
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
  });
}
