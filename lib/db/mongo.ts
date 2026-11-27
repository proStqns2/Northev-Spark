/**
 * MongoDB — miroir de données optionnel.
 *
 * Le site reste une application Next.js unique : la source de vérité est le
 * fichier `.data/db.json` (atomique, sans dépendance). MongoDB s'y ajoute
 * comme **miroir de lecture** et comme cible de sauvegarde :
 *
 *  - `MONGODB_URI` absent → tout fonctionne comme avant, `mongoStatus()`
 *    renvoie `{ configured: false }` et rien n'est tenté ;
 *  - `MONGODB_URI` présent → `/api/data/backup` copie l'instantané courant
 *    dans les collections `spark_users`, `spark_circuits`, `spark_progress`,
 *    `spark_sessions` ;
 *  - `MIRROR_MONGO=on` → chaque écriture planifie une copie différée (best
 *    effort, jamais bloquante) de la collection concernée.
 *
 * Pourquoi un miroir et pas une base principale ? Parce que la contrainte du
 * projet est « un seul serveur, un seul processus, ça doit tourner partout » :
 * MongoDB devient une option d'exploitation, pas une condition de démarrage.
 * Le pilote `mongodb` est chargé dynamiquement : son absence ne casse ni le
 * build ni l'exécution.
 */

import { snapshot, type DB } from './store';

export interface MongoStatus {
  configured: boolean;
  reachable: boolean;
  database?: string;
  driver: 'présent' | 'absent';
  mirror: boolean;
  error?: string;
  lastBackupAt?: string;
  lastCounts?: Record<string, number>;
}

interface MongoLike {
  connect(): Promise<void>;
  close(): Promise<void>;
  db(name?: string): {
    collection(name: string): {
      deleteMany(filter: Record<string, unknown>): Promise<unknown>;
      insertMany(documents: Record<string, unknown>[]): Promise<unknown>;
      createIndex(index: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<unknown>;
      countDocuments(filter?: Record<string, unknown>): Promise<number>;
      find(filter: Record<string, unknown>): { limit(n: number): { toArray(): Promise<Record<string, unknown>[]> } };
    };
  };
}

interface MongoClientLike {
  connect(): Promise<void>;
  close(): Promise<void>;
  db(name?: string): ReturnType<MongoLike['db']>;
}

let client: MongoClientLike | null = null;
let lastBackupAt: string | undefined;
let lastCounts: Record<string, number> | undefined;
let lastError: string | undefined;

const DATABASE = () => process.env.MONGODB_DB || 'northev_spark';

function uri(): string | undefined {
  return process.env.MONGODB_URI?.trim() || undefined;
}

export function mirrorEnabled(): boolean {
  return (process.env.MIRROR_MONGO ?? '').toLowerCase() === 'on';
}

/**
 * Charge le pilote à la demande. `null` = paquet non installé.
 *
 * L'import est volontairement « nu » (chaîne dynamique) : TypeScript ne
 * réclame pas les types du paquet, et le build Next n'échoue pas si Mongo
 * n'est pas installé — ce qui doit rester le cas par défaut.
 */
async function driver(): Promise<{ MongoClient: new (uri: string, options?: Record<string, unknown>) => MongoClientLike } | null> {
  try {
    const moduleName = 'mongodb';
    const loaded = (await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleName)) as unknown as {
      MongoClient: new (uri: string, options?: Record<string, unknown>) => MongoClientLike;
    };
    return loaded?.MongoClient ? loaded : null;
  } catch {
    return null;
  }
}

async function getClient(): Promise<MongoClientLike | null> {
  if (client) return client;
  const connection = uri();
  if (!connection) return null;
  const module = await driver();
  if (!module) {
    lastError = 'Pilote mongodb non installé (npm i mongodb).';
    return null;
  }
  const instance = new module.MongoClient(connection, { serverSelectionTimeoutMS: 4000 });
  await instance.connect();
  client = instance;
  lastError = undefined;
  return client;
}

export async function mongoStatus(): Promise<MongoStatus> {
  const configured = Boolean(uri());
  const module = await driver();
  const base: MongoStatus = {
    configured,
    reachable: false,
    database: configured ? DATABASE() : undefined,
    driver: module ? 'présent' : 'absent',
    mirror: mirrorEnabled(),
    lastBackupAt,
    lastCounts,
  };
  if (!configured) {
    return { ...base, error: 'MONGODB_URI non défini : le stockage local assure la persistance.' };
  }
  if (!module) return { ...base, error: lastError ?? 'Pilote mongodb absent.' };
  try {
    const instance = await getClient();
    if (!instance) return { ...base, error: lastError ?? 'Connexion impossible.' };
    // un comptage suffit à prouver que la base répond
    await instance.db(DATABASE()).collection('spark_users').countDocuments();
    return { ...base, reachable: true, error: undefined };
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Erreur MongoDB.';
    return { ...base, error: lastError };
  }
}

export interface BackupReport {
  ok: boolean;
  at?: string;
  counts?: Record<string, number>;
  error?: string;
}

/** Copie complète de l'instantané courant vers MongoDB. */
export async function backupToMongo(snapshotData?: DB): Promise<BackupReport> {
  const connection = uri();
  if (!connection) return { ok: false, error: 'MONGODB_URI non défini.' };
  let instance: MongoClientLike | null = null;
  try {
    instance = await getClient();
    if (!instance) return { ok: false, error: lastError ?? 'Connexion MongoDB impossible.' };
    const database = instance.db(DATABASE());
    const data = snapshotData ?? (await snapshot((db) => structuredClone(db)));
    const collections: Record<string, Record<string, unknown>[]> = {
      spark_users: (data.users ?? []).map(({ passwordHash, ...rest }) => ({ ...rest, passwordHashLength: passwordHash?.length ?? 0 })),
      spark_sessions: (data.sessions ?? []).map(({ token, ...rest }) => ({ ...rest, tokenHash: hash(token) })),
      spark_circuits: (data.circuits ?? []) as unknown as Record<string, unknown>[],
      spark_progress: (data.progress ?? []) as unknown as Record<string, unknown>[],
      spark_projects: (data.projects ?? []) as unknown as Record<string, unknown>[],
      spark_rooms: (data.rooms ?? []) as unknown as Record<string, unknown>[],
    };
    const counts: Record<string, number> = {};
    for (const [name, documents] of Object.entries(collections)) {
      const collection = database.collection(name);
      if (documents.length === 0) {
        counts[name] = 0;
        continue;
      }
      // remplacement complet : une sauvegarde doit être reproductible
      await collection.deleteMany({});
      await collection.insertMany(documents.map((document) => ({ ...document, _backupAt: new Date().toISOString() })));
      counts[name] = documents.length;
    }
    lastBackupAt = new Date().toISOString();
    lastCounts = counts;
    lastError = undefined;
    return { ok: true, at: lastBackupAt, counts };
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Erreur pendant la sauvegarde.';
    return { ok: false, error: lastError };
  }
}

/** Lecture d'une collection (diagnostic, exports). */
export async function readCollection(name: string, limit = 50): Promise<Record<string, unknown>[]> {
  try {
    const instance = await getClient();
    if (!instance) return [];
    return await instance.db(DATABASE()).collection(name).find({}).limit(Math.min(Math.max(limit, 1), 500)).toArray();
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Lecture impossible.';
    return [];
  }
}

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Miroir best-effort : on attend 4 s d'inactivité pour ne pas écrire à chaque
 * frappe. Une erreur de miroir ne remonte jamais à l'utilisateur.
 */
export function scheduleMirror(reason = 'écriture'): void {
  if (!mirrorEnabled() || !uri()) return;
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    mirrorTimer = null;
    void backupToMongo().then((report) => {
      if (!report.ok) console.warn(`[mongo] miroir (${reason}) ignoré : ${report.error}`);
    });
  }, 4000);
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close().catch(() => undefined);
    client = null;
  }
}

function hash(value: string): string {
  let first = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    first = Math.imul(first ^ value.charCodeAt(index), 0x01000193) >>> 0;
  }
  return first.toString(16).padStart(8, '0');
}
