import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SessionRecord, StoredCircuit, StoredRoom, StoredUser } from './store';

/**
 * Couche Supabase optionnelle.
 * Sans variables d'environnement, l'application fonctionne en mode démo local.
 * Avec SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, l'historique des comptes et
 * des montages est synchronisé (schéma : supabase/schema.sql).
 */
let cached: SupabaseClient | null | undefined;

export function supabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { 'x-application-name': 'northev-spark' },
      // borne chaque appel : un Supabase lent ou injoignable ne doit jamais
      // bloquer l'inscription ou la connexion (le compte reste en local).
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(1200) }),
    },
  });
  return cached;
}

export const cloudEnabled = (): boolean => supabaseAdmin() !== null;

/**
 * Borne l'attente d'un appel Supabase.
 *
 * Le client réessaie les GET avec backoff : si Supabase est lent ou
 * injoignable, l'inscription/connexion ne doit pas attendre des secondes.
 * Au-delà du délai, on continue en mode local (le compte reste valide).
 */
async function withTimeout<T>(promise: PromiseLike<T>, ms = 1000): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (error.message ?? '').toLowerCase().includes('does not exist')
  );
}

export async function backfillUser(user: StoredUser): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('profiles').upsert(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      theme: user.theme,
      role: user.role,
      password_hash: user.passwordHash,
      bio: user.bio ?? null,
      institution: user.institution ?? null,
      created_at: user.createdAt,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error && !isMissingTable(error)) {
    console.warn('[supabase] profiles upsert:', error.message);
  }
}

/**
 * Relit un profil depuis Supabase.
 *
 * Indispensable en production : le système de fichiers du serveur (où vit
 * `.data/db.json`) est éphémère sur Vercel. Sans cette lecture, un compte créé
 * avant un redéploiement devient introuvable et la connexion échoue.
 */
/**
 * Relit un profil par identifiant.
 *
 * Utilisé au rétablissement d'une session servie par une autre instance : le
 * jeton est valide, mais le compte n'est pas (ou plus) dans la mémoire locale.
 */
export async function pullUserById(id: string): Promise<StoredUser | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const result = await withTimeout(
    sb
      .from('profiles')
      .select('id,email,name,avatar,theme,role,password_hash,bio,institution,created_at,last_seen_at')
      .eq('id', id)
      .maybeSingle(),
  );
  if (!result || result.error || !result.data) return null;
  const row = result.data as Record<string, string | null>;
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    avatar: String(row.avatar ?? 'circuit'),
    theme: (row.theme as StoredUser['theme']) ?? 'nuit',
    role: (row.role as StoredUser['role']) ?? 'user',
    passwordHash: row.password_hash as string,
    bio: row.bio ?? undefined,
    institution: row.institution ?? undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    lastSeenAt: String(row.last_seen_at ?? new Date().toISOString()),
    prefs: { grid: true, animation: true, electronSpeed: 1, digits: 4 },
  };
}

export async function pullUserByEmail(email: string): Promise<StoredUser | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const result = await withTimeout(
    sb
      .from('profiles')
      .select('id,email,name,avatar,theme,role,password_hash,bio,institution,created_at,last_seen_at')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle(),
  );
  if (!result) return null; // délai dépassé : on continue en local
  const { data, error } = result;
  if (error) {
    if (!isMissingTable(error)) console.warn('[supabase] profiles select:', error.message);
    return null;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  // une base antérieure sans password_hash ne peut pas authentifier : on ignore
  if (typeof row.password_hash !== 'string' || !row.password_hash) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name ?? ''),
    avatar: String(row.avatar ?? 'circuit'),
    theme: (row.theme as StoredUser['theme']) ?? 'nuit',
    role: (row.role as StoredUser['role']) ?? 'user',
    passwordHash: row.password_hash,
    bio: (row.bio as string) ?? undefined,
    institution: (row.institution as string) ?? undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    lastSeenAt: String(row.last_seen_at ?? new Date().toISOString()),
    prefs: { grid: true, animation: true, electronSpeed: 1, digits: 4 },
  };
}

export async function pushCircuit(circuit: StoredCircuit): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('circuits').upsert(
    {
      id: circuit.id,
      owner_id: circuit.ownerId,
      name: circuit.name,
      notes: circuit.notes,
      doc: circuit.doc,
      template_slug: circuit.templateSlug ?? null,
      status: circuit.status,
      starred: circuit.starred,
      last_result: circuit.lastResult ?? null,
      collaborators: circuit.collaborators,
      created_at: circuit.createdAt,
      updated_at: circuit.updatedAt,
    },
    { onConflict: 'id' },
  );
  if (error && !isMissingTable(error)) {
    console.warn('[supabase] circuits upsert:', error.message);
  }
}

interface CircuitRow {
  id: string;
  owner_id: string;
  name: string;
  notes: string | null;
  doc: unknown;
  template_slug: string | null;
  status: StoredCircuit['status'];
  starred: boolean;
  last_result: StoredCircuit['lastResult'] | null;
  collaborators: string[] | null;
  created_at: string;
  updated_at: string;
}

export async function pullCircuits(ownerId: string): Promise<StoredCircuit[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const result = await withTimeout(
    sb
      .from('circuits')
      .select(
        'id, owner_id, name, notes, doc, template_slug, status, starred, last_result, collaborators, created_at, updated_at',
      )
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(200),
  );
  if (!result) return [];
  const { data, error } = result;
  if (error) {
    if (!isMissingTable(error)) console.warn('[supabase] circuits select:', error.message);
    return [];
  }
  return (data as CircuitRow[]).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    notes: row.notes ?? '',
    doc: row.doc,
    templateSlug: row.template_slug ?? undefined,
    status: row.status,
    starred: row.starred,
    lastResult: row.last_result ?? undefined,
    collaborators: row.collaborators ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function deleteRemoteCircuit(id: string, ownerId: string): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('circuits').delete().eq('id', id).eq('owner_id', ownerId);
  if (error && !isMissingTable(error)) console.warn('[supabase] circuits delete:', error.message);
}

export async function publishRoomEvent(payload: {
  code: string;
  kind: string;
  userId: string;
  data: unknown;
}): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('room_events').insert({
    room_code: payload.code,
    kind: payload.kind,
    user_id: payload.userId,
    data: payload.data,
  });
  if (error && !isMissingTable(error)) {
    console.warn('[supabase] room_events insert:', error.message);
  }
}

/* ------------------------------------------------------------------ sessions */

/**
 * Sessions serveur persistées.
 *
 * Le disque de `.data/db.json` est propre à chaque instance serverless : sans
 * cette table, une connexion faite sur une instance serait inconnue de la
 * suivante. Les jetons sont déjà des hachés (jamais le secret brut).
 */
export async function pushSession(record: SessionRecord): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('sessions').upsert(
    {
      token: record.token,
      user_id: record.userId,
      created_at: record.createdAt,
      expires_at: record.expiresAt,
    },
    { onConflict: 'token' },
  );
  if (error && !isMissingTable(error)) console.warn('[supabase] sessions upsert:', error.message);
}

export async function pullSession(token: string): Promise<SessionRecord | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const result = await withTimeout(
    sb.from('sessions').select('token,user_id,created_at,expires_at').eq('token', token).maybeSingle(),
  );
  if (!result || result.error || !result.data) return null;
  const row = result.data as {
    token: string;
    user_id: string;
    created_at: string;
    expires_at: string;
  };
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    token: row.token,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function deleteRemoteSession(token: string): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('sessions').delete().eq('token', token);
  if (error && !isMissingTable(error)) console.warn('[supabase] sessions delete:', error.message);
}

/** Purge des sessions expirées (appelée à la connexion, sans bloquer). */
export async function pruneRemoteSessions(): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('sessions').delete().lt('expires_at', new Date().toISOString());
  if (error && !isMissingTable(error)) console.warn('[supabase] sessions prune:', error.message);
}

/* --------------------------------------------------------------------- salles */

/** Copie la salle complète (document, révision, messages) vers Supabase. */
export async function pushRoom(room: StoredRoom): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from('rooms').upsert(
    {
      code: room.code,
      owner_id: room.ownerId,
      owner_name: room.ownerName,
      name: room.name,
      circuit_id: room.circuitId,
      project_id: room.projectId ?? null,
      doc: room.doc,
      revision: room.revision,
      presence: room.presence,
      messages: room.messages,
      closed: room.closed,
      created_at: room.createdAt,
      updated_at: room.updatedAt,
    },
    { onConflict: 'code' },
  );
  if (error && !isMissingTable(error)) console.warn('[supabase] rooms upsert:', error.message);
}

/** Relit une salle ouverte (utile quand une autre instance l'a créée). */
export async function pullRoom(code: string): Promise<StoredRoom | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const result = await withTimeout(
    sb.from('rooms').select('*').eq('code', code).eq('closed', false).maybeSingle(),
  );
  if (!result || result.error || !result.data) return null;
  const row = result.data as Record<string, unknown>;
  return {
    code: String(row.code),
    ownerId: String(row.owner_id ?? ''),
    ownerName: String(row.owner_name ?? ''),
    name: String(row.name ?? 'Atelier'),
    circuitId: String(row.circuit_id ?? ''),
    projectId: (row.project_id as string | null) ?? undefined,
    doc: row.doc,
    revision: Number(row.revision ?? 1),
    presence: (row.presence as StoredRoom['presence']) ?? {},
    messages: (row.messages as StoredRoom['messages']) ?? [],
    closed: Boolean(row.closed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Salles ouvertes d'un hôte (reprise après changement d'instance). */
export async function pullRoomsFor(ownerId: string): Promise<StoredRoom[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const result = await withTimeout(
    sb.from('rooms').select('*').eq('owner_id', ownerId).eq('closed', false),
  );
  if (!result || result.error || !result.data) return [];
  return (result.data as Array<Record<string, unknown>>).map((row) => ({
    code: String(row.code),
    ownerId: String(row.owner_id ?? ''),
    ownerName: String(row.owner_name ?? ''),
    name: String(row.name ?? 'Atelier'),
    circuitId: String(row.circuit_id ?? ''),
    projectId: (row.project_id as string | null) ?? undefined,
    doc: row.doc,
    revision: Number(row.revision ?? 1),
    presence: (row.presence as StoredRoom['presence']) ?? {},
    messages: (row.messages as StoredRoom['messages']) ?? [],
    closed: Boolean(row.closed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}
